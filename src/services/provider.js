import { ethers } from "ethers";

// Prefer env, fallback to placeholder Infura endpoints (should be replaced in env)
const HTTP_URL = process.env.ETH_RPC_URL || "https://mainnet.infura.io/v3/957f59124d9b452ba05edc816a0a97d5";
const WS_URL = process.env.ETH_WS_URL || "wss://mainnet.infura.io/ws/v3/957f59124d9b452ba05edc816a0a97d5";
const WS_URLS = (process.env.ETH_WS_URLS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
let wsIndex = 0;

// Disable HTTP batching to avoid mixed batch responses causing BAD_DATA on rate limits
function buildHttp(url) {
  return new ethers.JsonRpcProvider(
    url,
    undefined,
    {
      batchMaxCount: 1,
      batchStallTime: 0,
      staticNetwork: true,
    }
  );
}

const HTTP_URLS = (process.env.ETH_RPC_URLS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const httpProviders = (HTTP_URLS.length ? HTTP_URLS : [HTTP_URL]).map(buildHttp);
let httpIndex = 0;

function pickHttpProvider() {
  const p = httpProviders[httpIndex % httpProviders.length];
  httpIndex += 1;
  return p;
}

// Keep a default provider for general usage (single or first URL)
export const http = httpProviders[0];

export function createWsProvider() {
  const url = (WS_URLS.length > 0)
    ? WS_URLS[(wsIndex++) % WS_URLS.length]
    : WS_URL;
  const p = new ethers.WebSocketProvider(url);
  // Passive diagnostics; never throw
  p.on?.("error", (err) => console.error("WS provider error:", err?.message || err));
  p._websocket?.on?.("error", (err) => console.error("WS socket error:", err?.message || err));
  p._websocket?.on?.("close", (code) => console.error("WS closed:", code));
  console.log(`WS provider connected: ${url}`);
  return p;
}

// Basic backoff utility
function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

function isRateLimitError(err) {
  const msg = (err?.shortMessage || err?.message || "").toLowerCase();
  const code = err?.code;
  // Infura often returns -32005 Too Many Requests
  return msg.includes("too many requests") || code === -32005 || msg.includes("rate limit");
}

// getLogs with retries on rate-limit errors
export async function getLogsSafe(filter, { retries = 5, baseDelayMs = 500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const p = pickHttpProvider();
      // Using send ensures we control the call and errors
      return await p.send("eth_getLogs", [filter]);
    } catch (e) {
      if (isRateLimitError(e) && attempt < retries) {
        const backoff = Math.min(5000, baseDelayMs * 2 ** attempt);
        const jitter = Math.floor(Math.random() * 200);
        console.warn(`eth_getLogs rate limited; retrying in ${backoff + jitter}ms (attempt ${attempt + 1}/${retries})`);
        await wait(backoff + jitter);
        continue;
      }
      // rethrow non-rate-limit errors (or out of retries)
      throw e;
    }
  }
}

export async function getBlockNumberSafe({ retries = 5, baseDelayMs = 400 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const p = pickHttpProvider();
      return await p.getBlockNumber();
    } catch (e) {
      if (isRateLimitError(e) && attempt < retries) {
        const backoff = Math.min(4000, baseDelayMs * 2 ** attempt);
        const jitter = Math.floor(Math.random() * 150);
        console.warn(`getBlockNumber rate limited; retrying in ${backoff + jitter}ms (attempt ${attempt + 1}/${retries})`);
        await wait(backoff + jitter);
        continue;
      }
      if (attempt < retries) {
        const backoff = Math.min(3000, baseDelayMs * 2 ** attempt);
        await wait(backoff);
        continue;
      }
      throw e;
    }
  }
}

export async function getBlockSafe(blockNumber, includeTxs = true, { retries = 4, baseDelayMs = 400 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const p = pickHttpProvider();
      return await p.getBlock(blockNumber, includeTxs);
    } catch (e) {
      if (isRateLimitError(e) && attempt < retries) {
        const backoff = Math.min(4000, baseDelayMs * 2 ** attempt);
        const jitter = Math.floor(Math.random() * 150);
        console.warn(`getBlock rate limited; retrying in ${backoff + jitter}ms (attempt ${attempt + 1}/${retries})`);
        await wait(backoff + jitter);
        continue;
      }
      if (attempt < retries) {
        const backoff = Math.min(3000, baseDelayMs * 2 ** attempt);
        await wait(backoff);
        continue;
      }
      throw e;
    }
  }
}

export async function getCurrentBlock() {
  try {
    return await getBlockNumberSafe();
  } catch (e) {
    console.error("getCurrentBlock error:", e?.message || e);
    return null;
  }
}
