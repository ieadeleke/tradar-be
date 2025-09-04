import express from "express";
import { getTrades } from "../controllers/tradeController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect,getTrades);

export default router;
