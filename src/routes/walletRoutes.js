import express from "express";
import { getUserWallets } from "../controllers/walletController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect,getUserWallets);

export default router;
