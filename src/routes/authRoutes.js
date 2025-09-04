import express from "express";
import { registerUser, login, updateProfile, changePassword } from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", login);

router.post("/update", protect, updateProfile);
router.post("/change-password", protect, changePassword);


export default router;
