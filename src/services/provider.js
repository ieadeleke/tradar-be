import { ethers } from "ethers";

// Prefer env, fallback to placeholder Infura endpoints (should be replaced in env)
const HTTP_URL = process.env.ETH_RPC_URL || "https://mainnet.infura.io/v3/957f59124d9b452ba05edc816a0a97d5";
const WS_URL = process.env.ETH_WS_URL || "wss://mainnet.infura.io/ws/v3/957f59124d9b452ba05edc816a0a97d5";

export const http = new ethers.JsonRpcProvider(HTTP_URL);

export function createWsProvider() {
  const p = new ethers.WebSocketProvider(WS_URL);
  // Passive diagnostics; never throw
  p.on?.("error", (err) => console.error("WS provider error:", err?.message || err));
  p._websocket?.on?.("error", (err) => console.error("WS socket error:", err?.message || err));
  p._websocket?.on?.("close", (code) => console.error("WS closed:", code));
  return p;
}

export async function getCurrentBlock() {
  try {
    return await http.getBlockNumber();
  } catch (e) {
    console.error("getCurrentBlock error:", e?.message || e);
    return null;
  }
}
