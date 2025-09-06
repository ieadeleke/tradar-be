import express from "express";
import { getUserWallets, adminGetWalletsForUser } from "../controllers/walletController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { admin } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.get("/", protect,getUserWallets);
router.get("/admin/:userId", protect, admin, adminGetWalletsForUser);

export default router;
