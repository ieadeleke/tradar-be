import TradePortfolio from "../models/tradePortfolioModel.js";
import Wallet from "../models/walletModel.js";
import AutoTradeConfig from "../models/autoTradeModel.js";
import { ok, created, fail } from "../utils/response.js";
import fetch from "node-fetch";

const getOrCreatePortfolio = async (userId) => {
  const existing = await TradePortfolio.findOne({ user: userId });
  if (existing) return existing;
  return await TradePortfolio.create({ user: userId, balance: 10000, positions: [], history: [] });
};

const getOrCreateWallet = async (userId) => {
  // Reuse existing on-chain wallet as main wallet; assume at least one exists (ETH) from registration
  const w = await Wallet.findOne({ user: userId });
  return w;
};

export const getPortfolio = async (req, res) => {
  try {
    const pf = await getOrCreatePortfolio(req.user.id);
    ok(res, pf, "Portfolio fetched");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to load portfolio", error: e });
  }
};

export const setPortfolio = async (req, res) => {
  try {
    const { balance, positions, history } = req.body || {};
    const pf = await getOrCreatePortfolio(req.user.id);
    if (balance != null) pf.balance = Number(balance);
    if (Array.isArray(positions)) pf.positions = positions;
    if (Array.isArray(history)) pf.history = history;
    await pf.save();
    ok(res, pf, "Portfolio saved");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to save portfolio", error: e });
  }
};

export const createOrder = async (req, res) => {
  try {
    const pf = await getOrCreatePortfolio(req.user.id);
    const pos = req.body;
    if (!pos || !pos.id) return fail(res, { statusCode: 400, message: "Invalid order body", error: "Validation" });
    pf.positions.unshift(pos);
    await pf.save();
    ok(res, pf, "Order created");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to place order", error: e });
  }
};

export const closePosition = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return fail(res, { statusCode: 400, message: "Missing id", error: "Validation" });
    const pf = await getOrCreatePortfolio(req.user.id);
    const idx = pf.positions.findIndex((p) => p.id === id);
    if (idx === -1) return fail(res, { statusCode: 404, message: "Position not found", error: "Not found" });
    const pos = pf.positions[idx];
    pos.status = "closed";
    pf.history.unshift(pos);
    await pf.save();
    ok(res, pf, "Position closed");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to close position", error: e });
  }
};

// Price helpers using external APIs. Keep minimal; callers should ensure env keys available.
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
export async function latestPrice(assetType, symbol) {
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

// Core order open helper that can be reused from endpoints and autotrader
export async function openOrderForUser(userId, { assetType, symbol, side, orderType = "market", limitPrice, qty, leverage = 1, sl, tp }) {
  const q = Number(qty);
  const lev = Math.max(1, Number(leverage) || 1);
  if (!assetType || !symbol || !side || !q || q <= 0) throw new Error("Invalid order payload");
  const entry = orderType === "limit" ? Number(limitPrice) : await latestPrice(assetType, symbol);
  if (!entry || entry <= 0) throw new Error("Unable to fetch price");
  const notional = entry * q;
  const feeRate = 0.001;
  const openFee = notional * feeRate;
  const marginRequired = notional / lev;

  const wallet = await getOrCreateWallet(userId);
  if (!wallet || (wallet.balance || 0) < marginRequired + openFee) throw new Error("Insufficient wallet balance");
  wallet.balance = Number(wallet.balance || 0) - (marginRequired + openFee);

  const pf = await getOrCreatePortfolio(userId);
  const pos = {
    id: `${Date.now()}`,
    assetType,
    symbol,
    side,
    qty: q,
    entryPrice: entry,
    leverage: lev,
    marginAllocated: marginRequired,
    sl: sl ? Number(sl) : undefined,
    tp: tp ? Number(tp) : undefined,
    status: "open",
    pnl: 0,
  };
  pf.positions.unshift(pos);
  await wallet.save();
  await pf.save();
  return { wallet, portfolio: pf, position: pos };
}

export const openOrder = async (req, res) => {
  try {
    const { assetType, symbol, side, orderType = "market", limitPrice, qty, leverage = 1, sl, tp } = req.body || {};
    const result = await openOrderForUser(req.user.id, { assetType, symbol, side, orderType, limitPrice, qty, leverage, sl, tp });
    created(res, result, "Order opened");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to open order", error: e });
  }
};

export const closeOrder = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return fail(res, { statusCode: 400, message: "Missing id", error: "Validation" });
    const pf = await getOrCreatePortfolio(req.user.id);
    const idx = pf.positions.findIndex((p) => p.id === id && p.status === "open");
    if (idx === -1) return fail(res, { statusCode: 404, message: "Position not found", error: "Not found" });
    const p = pf.positions[idx];
    const price = await latestPrice(p.assetType, p.symbol);
    if (!price) return fail(res, { statusCode: 502, message: "Unable to fetch price", error: "Pricing" });
    const dir = p.side === "buy" ? 1 : -1;
    const grossPnl = (price - p.entryPrice) * dir * p.qty * p.leverage;
    const notional = p.entryPrice * p.qty;
    const closeFee = notional * 0.001;
    const net = (p.marginAllocated || 0) + grossPnl - closeFee;
    const wallet = await getOrCreateWallet(req.user.id);
    if (!wallet) return fail(res, { statusCode: 400, message: "Wallet not found", error: "Wallet" });
    wallet.balance = Number(wallet.balance || 0) + net;
    p.status = "closed";
    p.pnl = grossPnl;
    pf.history.unshift(p);
    pf.positions.splice(idx, 1);
    await wallet.save();
    await pf.save();
    ok(res, { wallet, portfolio: pf, position: p }, "Order closed");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to close order", error: e });
  }
};

export const listPositions = async (req, res) => {
  try {
    const pf = await getOrCreatePortfolio(req.user.id);
    ok(res, pf.positions, "Open positions");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed", error: e });
  }
};

export const listHistory = async (req, res) => {
  try {
    const pf = await getOrCreatePortfolio(req.user.id);
    ok(res, pf.history, "Position history");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed", error: e });
  }
};

// --- Autotrade (Mongo-backed scheduling) ---

export const getAutoTrade = async (req, res) => {
  try {
    const cfg = await AutoTradeConfig.findOne({ user: req.user.id });
    ok(res, cfg || {}, "Autotrade settings");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to load autotrade", error: e });
  }
};

export const setAutoTrade = async (req, res) => {
  try {
    const payload = req.body || {};
    const existing = await AutoTradeConfig.findOne({ user: req.user.id });
    let cfg;
    if (existing) {
      Object.assign(existing, payload);
      cfg = await existing.save();
    } else {
      cfg = await AutoTradeConfig.create({ user: req.user.id, ...payload });
    }
    ok(res, cfg, "Autotrade saved");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to save autotrade", error: e });
  }
};

export const autoTradeStatus = async (req, res) => {
  try {
    const cfg = await AutoTradeConfig.findOne({ user: req.user.id });
    const nextRunInSec = cfg?.nextRunAt ? Math.max(0, Math.round((cfg.nextRunAt.getTime() - Date.now())/1000)) : null;
    const paused = !!(cfg?.pausedUntil && cfg.pausedUntil > new Date());
    ok(res, {
      running: !!cfg?.enabled,
      processing: !!(cfg?.lockedUntil && cfg.lockedUntil > new Date()),
      paused,
      resumeAt: paused ? cfg?.pausedUntil : null,
      nextRunInSec,
      config: cfg || null,
    }, "Autotrade status");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to get status", error: e });
  }
};

export const startAutoTrade = async (req, res) => {
  try {
    const payload = req.body || {};
    let cfg = await AutoTradeConfig.findOne({ user: req.user.id });
    if (!cfg) cfg = await AutoTradeConfig.create({ user: req.user.id });
    const next = new Date();
    Object.assign(cfg, payload, { enabled: true, startedAt: new Date(), nextRunAt: next });
    // Initialize daily reference if needed
    if (!cfg.dailyDate) cfg.dailyDate = new Date(new Date().setHours(0,0,0,0));
    await cfg.save();
    ok(res, { running: true, config: cfg, nextRunAt: cfg.nextRunAt }, "Autotrade started");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to start autotrade", error: e });
  }
};

export const stopAutoTrade = async (req, res) => {
  try {
    const cfg = await AutoTradeConfig.findOne({ user: req.user.id });
    if (cfg) { cfg.enabled = false; cfg.nextRunAt = null; cfg.lockedUntil = null; await cfg.save(); }
    ok(res, { running: false, config: cfg || null }, "Autotrade stopped");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to stop autotrade", error: e });
  }
};

export const depositToTrading = async (req, res) => {
  try {
    const { amount } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) return fail(res, { statusCode: 400, message: "Invalid amount", error: "Validation" });
    const wallet = await getOrCreateWallet(req.user.id);
    if (!wallet || (wallet.balance || 0) < amt) return fail(res, { statusCode: 400, message: "Insufficient wallet balance", error: "Funds" });
    const pf = await getOrCreatePortfolio(req.user.id);
    wallet.balance = Number(wallet.balance || 0) - amt;
    pf.balance = Number(pf.balance || 0) + amt;
    await wallet.save();
    await pf.save();
    ok(res, { portfolio: pf, wallet }, "Deposit successful");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Deposit failed", error: e });
  }
};

export const withdrawFromTrading = async (req, res) => {
  try {
    const { amount } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) return fail(res, { statusCode: 400, message: "Invalid amount", error: "Validation" });
    const pf = await getOrCreatePortfolio(req.user.id);
    if ((pf.balance || 0) < amt) return fail(res, { statusCode: 400, message: "Insufficient trading balance", error: "Funds" });
    const wallet = await getOrCreateWallet(req.user.id);
    pf.balance = Number(pf.balance || 0) - amt;
    wallet.balance = Number(wallet.balance || 0) + amt;
    await pf.save();
    await wallet.save();
    ok(res, { portfolio: pf, wallet }, "Withdrawal successful");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Withdrawal failed", error: e });
  }
};

export const walletCredit = async (req, res) => {
  try {
    const { amount } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) return fail(res, { statusCode: 400, message: "Invalid amount", error: "Validation" });
    const wallet = await getOrCreateWallet(req.user.id);
    if (!wallet) return fail(res, { statusCode: 400, message: "Wallet not found", error: "Wallet" });
    wallet.balance = Number(wallet.balance || 0) + amt;
    await wallet.save();
    ok(res, wallet, "Wallet credited");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Wallet credit failed", error: e });
  }
};

export const walletDebit = async (req, res) => {
  try {
    const { amount } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) return fail(res, { statusCode: 400, message: "Invalid amount", error: "Validation" });
    const wallet = await getOrCreateWallet(req.user.id);
    if (!wallet || (wallet.balance || 0) < amt) return fail(res, { statusCode: 400, message: "Insufficient wallet balance", error: "Funds" });
    wallet.balance = Number(wallet.balance || 0) - amt;
    await wallet.save();
    ok(res, wallet, "Wallet debited");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Wallet debit failed", error: e });
  }
};
