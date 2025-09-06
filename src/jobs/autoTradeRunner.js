import AutoTradeConfig from "../models/autoTradeModel.js";
import TradePortfolio from "../models/tradePortfolioModel.js";
import Wallet from "../models/walletModel.js";
import fetch from "node-fetch";
import { openOrderForUser } from "../controllers/tradePortfolioController.js";
import User from "../models/userModel.js";
import { sendMail } from "../utils/mailer.js";

// Minimal price utilities (reuse controller helpers via openOrderForUser for execution)
const COINGECKO = "https://api.coingecko.com/api/v3";
async function fetchCryptoPrice(symbol) {
  const res = await fetch(`${COINGECKO}/simple/price?ids=${symbol}&vs_currencies=usd`);
  const j = await res.json();
  return Number(j?.[symbol]?.usd || 0);
}
function mapCommoditySymbol(symbol) {
  if (symbol === "GOLD") return "XAUUSD";
  if (symbol === "SILVER") return "XAGUSD";
  return symbol;
}
async function fetchStockOrCommodityPrice(symbol, assetType) {
  const key = process.env.ALPHA_VANTAGE_KEY || process.env.NEXT_PUBLIC_ALPHA_VANTAGE_KEY;
  if (!key) return 0;
  const mapped = assetType === "commodity" ? mapCommoditySymbol(symbol) : symbol;
  const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${mapped}&apikey=${key}`);
  const j = await res.json();
  return Number(j?.["Global Quote"]?.["05. price"] || 0);
}
async function latestPrice(assetType, symbol) {
  if (assetType === "crypto") return await fetchCryptoPrice(symbol);
  if (assetType === "forex") {
    const key = process.env.ALPHA_VANTAGE_KEY || process.env.NEXT_PUBLIC_ALPHA_VANTAGE_KEY;
    if (!key) return 0;
    const from = symbol.slice(0, 3);
    const to = symbol.slice(3, 6);
    const res = await fetch(`https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=${to}&apikey=${key}`);
    const j = await res.json();
    return Number(j?.["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"] || 0);
  }
  return await fetchStockOrCommodityPrice(symbol, assetType);
}

function sma(values, n) {
  if (!values || values.length < n) return null;
  const last = values.slice(-n);
  const sum = last.reduce((s, v) => s + v, 0);
  return sum / n;
}

function atrFromCloses(values, n) {
  if (!values || values.length < n + 1) return null;
  const last = values.slice(-(n + 1));
  let trs = [];
  for (let i = 1; i < last.length; i++) {
    const tr = Math.abs(last[i] - last[i - 1]);
    trs.push(tr);
  }
  const avg = trs.reduce((s, v) => s + v, 0) / trs.length;
  return avg;
}

async function acquireLock(cfgId, lockMs = 60000) {
  const now = new Date();
  const until = new Date(now.getTime() + lockMs);
  return AutoTradeConfig.findOneAndUpdate(
    { _id: cfgId, $or: [ { lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } } ] },
    { $set: { lockedUntil: until } },
    { new: true }
  );
}

async function releaseLock(cfgId) {
  await AutoTradeConfig.updateOne({ _id: cfgId }, { $unset: { lockedUntil: "" } });
}

async function processConfig(cfg) {
  const uid = String(cfg.user);
  const pf = await TradePortfolio.findOne({ user: uid });
  const openCount = (pf?.positions || []).filter((p) => p.status === "open").length;
  if (openCount >= (cfg.maxConcurrentPositions || 1)) return;

  const symbols = Array.isArray(cfg.symbols) && cfg.symbols.length ? cfg.symbols : ["bitcoin"];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const price = await latestPrice(cfg.assetType || "crypto", symbol);
  if (!price) return;

  // Update price history for momentum
  const history = Array.isArray(cfg.lastPrices) ? cfg.lastPrices.slice(-19) : [];
  history.push({ t: new Date(), p: price });
  cfg.lastPrices = history;

  const values = history.map(h => Number(h.p)).filter(v => v > 0);
  const short = sma(values, cfg.lookbackShort || 3);
  const long = sma(values, cfg.lookbackLong || 8);
  if (!short || !long) return; // not enough data yet
  const side = short > long ? "buy" : "sell";

  // Reset daily reference and unpause on new day
  const wallet = await Wallet.findOne({ user: uid });
  const bal = Number(wallet?.balance || 0);
  // Risk controls: daily cap and min free margin
  const today = new Date(); today.setHours(0,0,0,0);
  const cfgDay = cfg.dailyDate ? new Date(cfg.dailyDate) : null;
  if (!cfgDay || cfgDay.getTime() !== today.getTime()) {
    cfg.dailyDate = new Date(today);
    cfg.dailyRefEquity = bal; // reference equity as current wallet balance at day start
    cfg.pausedUntil = null;
    cfg.pausedReason = null;
  }
  // Respect pause
  if (cfg.pausedUntil && cfg.pausedUntil > new Date()) return;
  const ref = Number(cfg.dailyRefEquity || bal || 0);
  const drawdownPct = ref > 0 ? ((ref - bal) / ref) * 100 : 0;
  if (cfg.dailyMaxLossPct && drawdownPct >= cfg.dailyMaxLossPct) {
    // Pause until end of day
    const eod = new Date(today); eod.setHours(23,59,59,999);
    cfg.pausedUntil = eod;
    cfg.pausedReason = 'daily_max_loss';
    await cfg.save().catch(()=>{});
    // Notify user via email once when pausing
    try {
      const user = await User.findById(uid).lean();
      if (user?.email) {
        await sendMail({
          to: user.email,
          subject: 'Autotrade Paused: Daily Loss Cap Reached',
          html: `
            <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
              <h2>Autotrade Paused</h2>
              <p>Your autotrade has been paused because today's drawdown reached your daily max loss cap.</p>
              <ul>
                <li><b>Reference Equity:</b> $${(ref || 0).toFixed(2)}</li>
                <li><b>Current Balance:</b> $${bal.toFixed(2)}</li>
                <li><b>Drawdown:</b> ${drawdownPct.toFixed(2)}%</li>
                <li><b>Cap:</b> ${Number(cfg.dailyMaxLossPct).toFixed(2)}%</li>
                <li><b>Resumes:</b> ${eod.toLocaleString()}</li>
              </ul>
              <p>You can adjust risk settings in your dashboard → Autotrade.</p>
            </div>
          `,
        });
      }
    } catch (_) {}
    return;
  }
  if (cfg.minFreeMarginPct && ref > 0) {
    const freePct = (bal / ref) * 100;
    if (freePct < cfg.minFreeMarginPct) return; // not enough free margin vs reference
  }
  // Position sizing
  // Merge per-symbol overrides
  const ov = (Array.isArray(cfg.overrides) ? cfg.overrides : []).find(o => o && (o.symbol || '').toLowerCase() === symbol.toLowerCase()) || {};
  const lev = Math.max(1, Number(ov.leverage != null ? ov.leverage : (cfg.leverage || 1)));
  let qty = 0;
  const sizingMode = cfg.sizingMode || 'percent';
  if (sizingMode === 'fixed') {
    const fixed = Math.max(0, Number(cfg.fixedNotionalUSD || 0));
    const notional = fixed > 0 ? fixed : (bal * 0.01); // fallback tiny
    qty = Math.max(0.0001, notional / price);
  } else if (sizingMode === 'kelly') {
    const frac = Math.max(0.1, Math.min(100, Number(cfg.kellyFractionPct || 5)));
    const margin = (bal * frac) / 100;
    const notional = margin * lev;
    qty = Math.max(0.0001, notional / price);
  } else {
    const riskPct = Math.max(0.1, Math.min(100, Number(cfg.riskPerTradePct || 1)));
    const margin = (bal * riskPct) / 100;
    const notional = margin * lev;
    qty = Math.max(0.0001, notional / price);
  }

  // Avoid same-side duplicate position per asset
  if (cfg.avoidDuplicateSide) {
    const dup = (pf?.positions || []).some(p => p.status === 'open' && p.symbol === symbol && p.side === side);
    if (dup) return;
  }

  // SL/TP templating
  let sl, tp;
  const atrEnabled = ov.atrEnabled != null ? ov.atrEnabled : cfg.atrEnabled;
  if (atrEnabled) {
    const period = Math.max(2, Number((ov.atrPeriod != null ? ov.atrPeriod : cfg.atrPeriod) || 14));
    const atr = atrFromCloses(values, period);
    if (!atr) return; // wait for ATR readiness
    const slDist = (Number((ov.atrSlMult != null ? ov.atrSlMult : cfg.atrSlMult) || 1.5)) * atr;
    const tpDist = (Number((ov.atrTpMult != null ? ov.atrTpMult : cfg.atrTpMult) || 2)) * atr;
    sl = side === 'buy' ? (price - slDist) : (price + slDist);
    tp = side === 'buy' ? (price + tpDist) : (price - tpDist);
  } else {
    const slPct = Math.max(0, Number((ov.slPct != null ? ov.slPct : cfg.slPct) || 0));
    const tpPct = Math.max(0, Number((ov.tpPct != null ? ov.tpPct : cfg.tpPct) || 0));
    sl = slPct > 0 ? (side === 'buy' ? price * (1 - slPct/100) : price * (1 + slPct/100)) : undefined;
    tp = tpPct > 0 ? (side === 'buy' ? price * (1 + tpPct/100) : price * (1 - tpPct/100)) : undefined;
  }

  try {
    await openOrderForUser(uid, { assetType: cfg.assetType || "crypto", symbol, side, qty, leverage: lev, sl, tp });
  } catch (_) {
    // ignore failures (e.g., insufficient funds)
  }
}

export function startAutoTradeRunner({ intervalMs = 5000 } = {}) {
  setInterval(async () => {
    const now = new Date();
    const due = await AutoTradeConfig.find({
      enabled: true,
      $or: [ { nextRunAt: { $exists: false } }, { nextRunAt: { $lte: now } } ],
    }).limit(50);
    for (const cfg of due) {
      const locked = await acquireLock(cfg._id).catch(() => null);
      if (!locked) continue;
      try {
        await processConfig(locked);
      } finally {
        const next = new Date(Date.now() + 1000 * Math.max(1, Number(locked.intervalSec || 60)));
        locked.lastRunAt = new Date();
        locked.nextRunAt = next;
        await locked.save().catch(()=>{});
        await releaseLock(locked._id);
      }
    }
  }, intervalMs);
}
