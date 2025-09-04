import Trade from "../models/tradeModel.js";
import { ok } from "../utils/response.js";

export const getTrades = async (req, res, next) => {
  try {
    const trades = await Trade.find({}).populate("buyOrder sellOrder");
    ok(res, trades, "Trades fetched");
  } catch (err) {
    next(err);
  }
};
