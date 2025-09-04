import mongoose from "mongoose";

const PositionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    assetType: { type: String, enum: ["crypto", "stock", "commodity", "forex"], required: true },
    symbol: { type: String, required: true },
    side: { type: String, enum: ["buy", "sell"], required: true },
    qty: { type: Number, required: true },
    entryPrice: { type: Number, required: true },
    leverage: { type: Number, default: 1 },
    marginAllocated: { type: Number, default: 0 },
    sl: { type: Number },
    tp: { type: Number },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    pnl: { type: Number, default: 0 },
  },
  { _id: false }
);

const PortfolioSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true, unique: true },
    balance: { type: Number, default: 10000 },
    positions: { type: [PositionSchema], default: [] },
    history: { type: [PositionSchema], default: [] },
  },
  { timestamps: true }
);

const TradePortfolio = mongoose.models.TradePortfolio || mongoose.model("TradePortfolio", PortfolioSchema);

export default TradePortfolio;

