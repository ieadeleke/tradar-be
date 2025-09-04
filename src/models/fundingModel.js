import mongoose from "mongoose";

const fundingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    method: { type: String, enum: ["bank", "crypto", "paypal", "card"], required: true },
    amount: { type: Number, required: true },
    asset: { type: String, default: "USD" },
    network: { type: String },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    meta: { type: mongoose.Schema.Types.Mixed },
    proof: {
      url: String,
      filename: String,
      mimetype: String,
      size: Number,
      path: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Funding", fundingSchema);

