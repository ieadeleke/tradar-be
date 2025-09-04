import { ethers } from "ethers";
export function generateEthWallet() {
  const w = ethers.Wallet.createRandom();
  return { address: w.address.toLowerCase(), privateKey: w.privateKey };
}
