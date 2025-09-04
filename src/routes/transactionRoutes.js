import express from "express";
import { createTransaction, getTransactions } from "../controllers/transactionController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect,createTransaction);
router.get("/", protect,getTransactions);

export default router;
