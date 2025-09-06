import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  getPortfolio,
  setPortfolio,
  createOrder,
  closePosition,
  openOrder,
  closeOrder,
  listPositions,
  listHistory,
  depositToTrading,
  withdrawFromTrading,
  walletCredit,
  walletDebit,
  // Autotrade
  getAutoTrade,
  setAutoTrade,
  startAutoTrade,
  stopAutoTrade,
  autoTradeStatus,
} from "../controllers/tradePortfolioController.js";

const router = express.Router();

router.get("/portfolio", protect, getPortfolio);
router.post("/portfolio", protect, setPortfolio);
router.post("/orders", protect, createOrder);
router.post("/close", protect, closePosition);

// Pro endpoints
router.post("/order/open", protect, openOrder);
router.post("/order/close", protect, closeOrder);
router.get("/positions", protect, listPositions);
router.get("/history", protect, listHistory);

// Balance ops
router.post("/deposit", protect, depositToTrading);
router.post("/withdraw", protect, withdrawFromTrading);
router.post("/wallet/credit", protect, walletCredit);
router.post("/wallet/debit", protect, walletDebit);

// Autotrade
router.get("/autotrade", protect, getAutoTrade);
router.post("/autotrade", protect, setAutoTrade);
router.get("/autotrade/status", protect, autoTradeStatus);
router.post("/autotrade/start", protect, startAutoTrade);
router.post("/autotrade/stop", protect, stopAutoTrade);

export default router;
