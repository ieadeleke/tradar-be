import { ethers } from "ethers";
import { http, createWsProvider, getCurrentBlock, getLogsSafe, getBlockSafe } from "./provider.js";
import Wallet from "../models/walletModel.js";
import Tx from "../models/txModel.js";
import Setting from "../models/settingModel.js";
import { allAddresses, hasAddress } from "./addressBook.js";
import { ERC20_ABI } from "../constants/erc20Abi.js";

const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);
const TOKEN_ADDRS = (process.env.ERC20_TRACKED || "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const tokenContracts = TOKEN_ADDRS.map(a => ({ address: a, iface: new ethers.Interface(ERC20_ABI) }));
const TRANSFER_TOPIC = new ethers.Interface(ERC20_ABI).getEvent("Transfer").topicHash;
const TOKEN_SCAN_DELAY_MS = Number(process.env.TOKEN_SCAN_DELAY_MS || 150);
const TOKEN_SCAN_JITTER_MS = Number(process.env.TOKEN_SCAN_JITTER_MS || 120);

const tokenMetaCache = new Map();
async function getTokenMeta(tokenAddress) {
  const key = tokenAddress.toLowerCase();
  if (tokenMetaCache.has(key)) return tokenMetaCache.get(key);
  try {
    const c = new ethers.Contract(tokenAddress, ERC20_ABI, http);
    const [decimals, symbol] = await Promise.all([
      c.decimals().catch(() => 18),
      c.symbol().catch(() => "ERC20"),
    ]);
    const meta = { decimals: Number(decimals), symbol };
    tokenMetaCache.set(key, meta);
    return meta;
  } catch (_) {
    const meta = { decimals: 18, symbol: "ERC20" };
    tokenMetaCache.set(key, meta);
    return meta;
  }
}

function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

// ---- helpers
async function getCursor() {
  const doc = await Setting.findOne({ key: "eth_cursor" });
  return doc?.value || null;
}
async function setCursor(blockNumber) {
  await Setting.updateOne({ key: "eth_cursor" }, { $set: { value: blockNumber } }, { upsert: true });
}
function toDec(amountWei) { return ethers.formatEther(amountWei); } // ETH only; ERC20 uses value/10**decimals if you wish

// ---- credit user balance once confirmed (idempotent)
async function creditIfConfirmed(txDoc) {
  if (txDoc.status !== "confirmed" || txDoc.credited) return;

  await Wallet.updateOne(
    { _id: txDoc.wallet },
    { $inc: { balance: Number(txDoc.amount) } } // off-chain accounting (ETH in ETH units)
  );

  await Tx.updateOne({ _id: txDoc._id }, { $set: { credited: true } });
}

// ---- process one confirmed ETH tx to a user wallet
async function handleEthTx(tx, currentBlock) {
  if (!tx.to) return;
  const to = tx.to.toLowerCase();
  if (!hasAddress(to)) return;

  const wallet = await Wallet.findOne({ address: to });
  if (!wallet) return;

  const confirmations = currentBlock - tx.blockNumber + 1;
  const status = confirmations >= CONFIRMATIONS ? "confirmed" : "pending";

  const amount = toDec(tx.value);

  // Upsert by txHash (ETH)
  const doc = await Tx.findOneAndUpdate(
    { txHash: tx.hash.toLowerCase(), logIndex: null },
    {
      $setOnInsert: {
        user: wallet.user,
        wallet: wallet._id,
        direction: "deposit",
        chain: "ethereum",
        assetSymbol: "ETH",
        assetAddress: null,
        amount,
        blockNumber: tx.blockNumber,
      },
      $set: { confirmations, status },
    },
    { upsert: true, new: true }
  );

  if (doc.status === "confirmed") await creditIfConfirmed(doc);
}

// ---- process ERC20 logs for the block
async function handleErc20Logs(blockNumber, currentBlock) {
  for (const { address: tokenAddress, iface } of tokenContracts) {
    let meta = { decimals: 18, symbol: "ERC20" };
    try { meta = await getTokenMeta(tokenAddress); } catch (_) {}
    let logs = [];
    try {
      // small jitter to avoid synchronized bursts across tokens
      if (TOKEN_SCAN_JITTER_MS > 0) {
        const jitter = Math.floor(Math.random() * TOKEN_SCAN_JITTER_MS);
        await wait(jitter);
      }
      logs = await getLogsSafe({
        address: tokenAddress,
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [TRANSFER_TOPIC], // we’ll filter 'to' in code for many addresses
      }, { retries: 4, baseDelayMs: 500 });
    } catch (e) {
      console.error("getLogs error:", e?.message || e);
      continue;
    }

    for (const log of logs) {
      const parsed = iface.parseLog(log);
      const to = parsed.args[1].toLowerCase(); // indexed 'to'
      if (!hasAddress(to)) continue;

      const value = parsed.args[2]; // BigInt
      // NOTE: if you want precise token units, fetch decimals per token and divide value accordingly.
      // For now we store raw "value" in wei-equivalent (string). Or compute with decimals cache.
      const wallet = await Wallet.findOne({ address: to });
      if (!wallet) continue;

      const confirmations = currentBlock - (log.blockNumber || 0) + 1;
      const status = confirmations >= CONFIRMATIONS ? "confirmed" : "pending";
      const amountEthUnits = ethers.formatUnits(value, meta.decimals);

      const doc = await Tx.findOneAndUpdate(
        { txHash: log.transactionHash.toLowerCase(), logIndex: log.logIndex },
        {
          $setOnInsert: {
            user: wallet.user,
            wallet: wallet._id,
            direction: "deposit",
            chain: "ethereum",
            assetSymbol: meta.symbol,
            assetAddress: tokenAddress,
            amount: amountEthUnits,
            blockNumber: log.blockNumber,
          },
          $set: { confirmations, status },
        },
        { upsert: true, new: true }
      );

      if (doc.status === "confirmed") await creditIfConfirmed(doc);
    }
    if (TOKEN_SCAN_DELAY_MS > 0) { await wait(TOKEN_SCAN_DELAY_MS); }
  }
}

// ---- process a single block (ETH txs + ERC20 logs)
async function processBlock(blockNumber) {
  let currentBlock;
  try {
    currentBlock = await http.getBlockNumber();
  } catch (e) {
    console.error("getBlockNumber error:", e?.message || e);
    return; // bail out gracefully
  }

  let block;
  try {
    block = await getBlockSafe(blockNumber, true);
  } catch (e) {
    console.error("getBlock error:", e?.message || e);
    return;
  }

  // ETH transfers directly into user wallets
  for (const tx of block.transactions) {
    await handleEthTx(tx, currentBlock);
  }

  // ERC20 transfers into user wallets (for tracked tokens)
  if (tokenContracts.length) {
    await handleErc20Logs(blockNumber, currentBlock);
  }

  await setCursor(blockNumber);
}

// ---- catch-up on startup + live follow
export async function startDepositIndexer() {
  try {
    // helper: catch-up attempts with retry on failure
    const attemptCatchUp = async () => {
      const tip = await getCurrentBlock();
      if (tip == null) return false;

      const cursor = (await getCursor()) ?? tip;
      for (let b = cursor; b <= tip; b++) {
        try {
          await processBlock(b);
        } catch (e) {
          console.error("Caught-up block processing error:", e?.message || e);
        }
      }
      return true;
    };

    // initial catch-up (non-fatal on failure)
    const ok = await attemptCatchUp();
    if (!ok) {
      console.error("Catch-up failed; will retry in 15s.");
      setTimeout(async () => {
        try { await attemptCatchUp(); } catch (_) {}
      }, 15000);
    }

    // realtime follow with auto-reconnect
    let ws = createWsProvider();
    let reconnectAttempts = 0;

    const attach = () => {
      ws.on("block", async (bNumber) => {
        try {
          await processBlock(bNumber);
        } catch (e) {
          console.error("Block processing error:", e?.message || e);
        }
      });

      // reset backoff when connection is open (best-effort)
      ws._websocket?.on?.("open", () => { reconnectAttempts = 0; });

      ws._websocket?.on?.("close", () => {
        console.error("WS closed. Reconnecting with backoff...");
        scheduleReconnect();
      });

      ws.on?.("error", (err) => {
        console.error("WS provider error (indexer):", err?.message || err);
      });
    };

    const scheduleReconnect = () => {
      reconnectAttempts += 1;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts, 5));
      setTimeout(() => {
        try {
          ws = createWsProvider();
          attach();
        } catch (e) {
          console.error("Reconnect failed:", e?.message || e);
          scheduleReconnect();
        }
      }, delay);
    };

    attach();

    console.log(`📡 Deposit indexer running. Watching ${allAddresses().size} wallet(s).`);
  } catch (e) {
    // ensure we never throw out of this function; only log
    console.error("startDepositIndexer failed:", e?.message || e);
  }
}
