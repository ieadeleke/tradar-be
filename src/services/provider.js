import { ethers } from "ethers";

console.log(process.env.ETH_RPC_URL)

export const http = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/957f59124d9b452ba05edc816a0a97d5');
export const ws = new ethers.WebSocketProvider('wss://mainnet.infura.io/ws/v3/957f59124d9b452ba05edc816a0a97d5');

export async function getCurrentBlock() {
  return http.getBlockNumber();
}
