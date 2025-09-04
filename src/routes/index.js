import express from "express";
import authRoutes from "./authRoutes.js";
import assetRoutes from "./assetRoutes.js";
import walletRoutes from "./walletRoutes.js";
import orderRoutes from "./orderRoutes.js";
import tradeRoutes from "./tradeRoutes.js";
import transactionRoutes from "./transactionRoutes.js";
import loanRoutes from "./loanRoutes.js";
import tradePortfolioRoutes from "./tradePortfolioRoutes.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/assets", assetRoutes);
router.use("/wallets", walletRoutes);
router.use("/orders", orderRoutes);
router.use("/trades", tradeRoutes);
router.use("/transactions", transactionRoutes);
router.use("/loans", loanRoutes);
router.use("/trade", tradePortfolioRoutes);

export default router;
