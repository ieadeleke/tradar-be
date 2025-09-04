import mongoose from "mongoose";

const assetSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, unique: true }, // e.g. BTC
    name: { type: String, required: true },                 // e.g. Bitcoin
    type: { type: String, enum: ["crypto", "fiat"], default: "crypto" },
  },
  { timestamps: true }
);

const Asset = mongoose.model("Asset", assetSchema);
export default Asset;
