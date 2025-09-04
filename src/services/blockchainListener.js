import { ethers } from "ethers";
import dotenv from "dotenv";
import Wallet from "../models/walletModel.js";

dotenv.config();

// WebSocket provider
const provider = new ethers.WebSocketProvider(process.env.INFURA_WS);

export const listenForDeposits = () => {
  console.log("🔗 Listening for ETH transactions...");

  // Listen to *all* pending transactions
  provider.on("pending", async (txHash) => {
    try {
      const tx = await provider.getTransaction(txHash);
      if (!tx || !tx.to) return;

      // Check if tx.to matches any user wallet in DB
      const wallet = await Wallet.findOne({ address: tx.to.toLowerCase() });
      if (wallet) {
        console.log(`📥 Deposit detected for ${wallet.user}: ${tx.value.toString()}`);

        // Convert value from wei → ETH
        const amountEth = ethers.formatEther(tx.value);

        // Update balance
        wallet.balance = parseFloat(wallet.balance) + parseFloat(amountEth);
        await wallet.save();

        console.log(`✅ Wallet ${wallet.address} updated. New balance: ${wallet.balance} ETH`);
      }
    } catch (err) {
      console.error("Error handling tx:", err.message);
    }
  });
};
