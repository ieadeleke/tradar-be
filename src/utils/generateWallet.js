import { ethers } from "ethers";

export const generateEthWallet = () => {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,       // Public address (for deposits)
    privateKey: wallet.privateKey, // Store securely (encrypted)
  };
};
