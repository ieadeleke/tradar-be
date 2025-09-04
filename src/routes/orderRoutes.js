import express from "express";
import { placeOrder, getOrders } from "../controllers/orderController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect,placeOrder);
router.get("/", protect,getOrders);

export default router;
