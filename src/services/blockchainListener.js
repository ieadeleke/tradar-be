import { ethers } from "ethers";
import dotenv from "dotenv";
import Wallet from "../models/walletModel.js";
import { createWsProvider } from "./provider.js";

dotenv.config();

export const listenForDeposits = () => {
  console.log("🔗 Listening for ETH transactions...");

  let provider = createWsProvider();
  let reconnectAttempts = 0;

  const attach = () => {
    // Listen to all pending transactions
    provider.on("pending", async (txHash) => {
      try {
        const tx = await provider.getTransaction(txHash);
        if (!tx || !tx.to) return;

        const wallet = await Wallet.findOne({ address: tx.to.toLowerCase() });
        if (wallet) {
          console.log(`📥 Deposit detected for ${wallet.user}: ${tx.value.toString()}`);
          const amountEth = ethers.formatEther(tx.value);
          wallet.balance = parseFloat(wallet.balance) + parseFloat(amountEth);
          await wallet.save();
          console.log(`✅ Wallet ${wallet.address} updated. New balance: ${wallet.balance} ETH`);
        }
      } catch (err) {
        console.error("Error handling tx:", err?.message || err);
      }
    });

    provider._websocket?.on?.("open", () => { reconnectAttempts = 0; });
    provider._websocket?.on?.("close", () => {
      console.error("WS closed (listener). Reconnecting...");
      scheduleReconnect();
    });
    provider.on?.("error", (err) => console.error("WS provider error (listener):", err?.message || err));
    provider._websocket?.on?.("error", (err) => console.error("WS socket error (listener):", err?.message || err));
  };

  const scheduleReconnect = () => {
    reconnectAttempts += 1;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts, 5));
    setTimeout(() => {
      try {
        provider = createWsProvider();
        attach();
      } catch (e) {
        console.error("Listener reconnect failed:", e?.message || e);
        scheduleReconnect();
      }
    }, delay);
  };

  attach();
};
