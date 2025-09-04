import mongoose from "mongoose";

const encSchema = new mongoose.Schema(
  { ct: String, iv: String, tag: String },
  { _id: false }
);

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    address: { type: String, required: true, unique: true, lowercase: true },
    chain: { type: String, enum: ["ethereum"], default: "ethereum" },
    asset: { type: String, default: "ETH" },         // base asset for this wallet
    encPrivKey: { type: encSchema, required: true }, // AES-256-GCM encrypted
    balance: { type: Number, default: 0 },           // off-chain accounted balance
  },
  { timestamps: true }
);

walletSchema.index({ address: 1 }, { unique: true });

export default mongoose.model("Wallet", walletSchema);
