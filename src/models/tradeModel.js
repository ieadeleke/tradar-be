import mongoose from "mongoose";

const tradeSchema = new mongoose.Schema(
  {
    buyOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    sellOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    price: { type: Number, required: true },
    amount: { type: Number, required: true },
    pair: { type: String, required: true }, // e.g. BTC/USDT
  },
  { timestamps: true }
);

const Trade = mongoose.model("Trade", tradeSchema);
export default Trade;
