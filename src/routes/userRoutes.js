import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { admin } from "../middlewares/adminMiddleware.js";
import { adminListUsers, adminGetUser, adminUpdateUser, adminUpdateUserStatus, adminListUserTransactions, adminUsersSummary, adminCreateUser } from "../controllers/userController.js";

const router = express.Router();

// Admin-only user management
router.get("/", protect, admin, adminListUsers);
router.get("/:id", protect, admin, adminGetUser);
router.get("/summary", protect, admin, adminUsersSummary);
router.post("/admin/create", protect, admin, adminCreateUser);
router.patch("/:id", protect, admin, adminUpdateUser);
router.patch("/:id/status", protect, admin, adminUpdateUserStatus);
router.get("/:id/transactions", protect, admin, adminListUserTransactions);

export default router;
