import Order from "../models/orderModel.js";
import { created, ok } from "../utils/response.js";

export const placeOrder = async (req, res, next) => {
  try {
    const { pair, type, price, amount } = req.body;
    const order = await Order.create({
      user: req.user.id,
      pair,
      type,
      price,
      amount,
    });
    created(res, order, "Order placed");
  } catch (err) {
    next(err);
  }
};

export const getOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id });
    ok(res, orders, "Orders fetched");
  } catch (err) {
    next(err);
  }
};
