import mongoose from "mongoose";

const txSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", index: true },
    direction: { type: String, enum: ["deposit", "withdraw"], required: true },
    chain: { type: String, default: "ethereum" },
    assetSymbol: { type: String, required: true },      // ETH, USDT, USDC, ...
    assetAddress: { type: String, default: null },      // null for ETH
    amount: { type: String, required: true },           // string to preserve precision
    txHash: { type: String, required: true, lowercase: true },
    logIndex: { type: Number, default: null },          // for ERC20 uniqueness
    status: { type: String, enum: ["pending", "confirmed", "failed"], default: "pending" },
    blockNumber: { type: Number, required: true },
    confirmations: { type: Number, default: 0 },
    credited: { type: Boolean, default: false },        // whether user balance credited
  },
  { timestamps: true }
);

// Uniqueness: ETH transfer -> txHash unique; ERC20 -> txHash+logIndex unique
txSchema.index({ txHash: 1 }, { unique: false });
txSchema.index({ txHash: 1, logIndex: 1 }, { unique: true });

export default mongoose.model("Tx", txSchema);
