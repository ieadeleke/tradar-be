import Transaction from "../models/transactionModel.js";
import { created, ok } from "../utils/response.js";

export const createTransaction = async (req, res, next) => {
  try {
    const { asset, type, amount, txHash } = req.body;
    const tx = await Transaction.create({
      user: req.user.id,
      asset,
      type,
      amount,
      txHash,
    });
    created(res, tx, "Transaction created");
  } catch (err) {
    next(err);
  }
};

export const getTransactions = async (req, res, next) => {
  try {
    const txs = await Transaction.find({ user: req.user.id }).populate("asset");
    ok(res, txs, "Transactions fetched");
  } catch (err) {
    next(err);
  }
};
