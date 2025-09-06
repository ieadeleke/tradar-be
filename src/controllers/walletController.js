import Wallet from "../models/walletModel.js";
import { ok, fail } from "../utils/response.js";

export const getUserWallets = async (req, res, next) => {
  try {
    const wallets = await Wallet.find({ user: req.user.id }).populate("asset");
    ok(res, wallets, "Wallets fetched");
  } catch (err) {
    next(err);
  }
};

export const adminGetWalletsForUser = async (req, res) => {
  try {
    const { userId } = req.params
    const wallets = await Wallet.find({ user: userId }).populate("asset")
    ok(res, wallets, "User wallets fetched")
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to fetch user wallets", error: e })
  }
}
