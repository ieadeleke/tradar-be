import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// Connect to Ethereum mainnet via Infura or Alchemy
const provider = new ethers.JsonRpcProvider(
  `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
  // OR: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
);

// Get balance of an ETH wallet (logs on failure)
export const getWalletBalance = async (address) => {
  try {
    const balanceWei = await provider.getBalance(address);
    return ethers.formatEther(balanceWei); // in ETH
  } catch (e) {
    console.error("getWalletBalance error:", e?.message || e);
    return null;
  }
};

// Send a transaction (for withdrawals)
export const sendTransaction = async (privateKey, to, amountEth) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const tx = await wallet.sendTransaction({
      to,
      value: ethers.parseEther(amountEth.toString()),
    });
    return tx.hash;
  } catch (e) {
    console.error("sendTransaction error:", e?.message || e);
    return null;
  }
};
