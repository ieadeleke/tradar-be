import { ethers } from "ethers";
import { http, ws, getCurrentBlock } from "./provider.js";
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
    const logs = await http.getLogs({
      address: tokenAddress,
      fromBlock: blockNumber,
      toBlock: blockNumber,
      topics: [TRANSFER_TOPIC], // we’ll filter 'to' in code for many addresses
    });

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

      const amountEthUnits = toDec(value); // WARNING: assumes 18 decimals; for USDT/USDC adjust using decimals()

      const doc = await Tx.findOneAndUpdate(
        { txHash: log.transactionHash.toLowerCase(), logIndex: log.logIndex },
        {
          $setOnInsert: {
            user: wallet.user,
            wallet: wallet._id,
            direction: "deposit",
            chain: "ethereum",
            assetSymbol: "ERC20",       // you can resolve actual symbol with a cache
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
  }
}

// ---- process a single block (ETH txs + ERC20 logs)
async function processBlock(blockNumber) {
  const currentBlock = await http.getBlockNumber();
  const block = await http.getBlock(blockNumber, true); // include txs

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
  // catch up from last cursor
  const tip = await getCurrentBlock();
  const cursor = (await getCursor()) ?? tip;

  // If we missed blocks, catch up sequentially
  for (let b = cursor; b <= tip; b++) {
    await processBlock(b);
  }

  // then follow new blocks in realtime
  ws.on("block", async (bNumber) => {
    try {
      await processBlock(bNumber);
    } catch (e) {
      console.error("Block processing error:", e);
    }
  });

  ws._websocket?.on("close", () => {
    console.error("WS closed. Consider reconnect logic.");
  });

  console.log(`📡 Deposit indexer running. Watching ${allAddresses().size} wallet(s).`);
}
