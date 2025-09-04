import Wallet from "../models/walletModel.js";
import { ok } from "../utils/response.js";

export const getUserWallets = async (req, res, next) => {
  try {
    const wallets = await Wallet.find({ user: req.user.id }).populate("asset");
    ok(res, wallets, "Wallets fetched");
  } catch (err) {
    next(err);
  }
};
