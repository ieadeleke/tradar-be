import express from "express";
import { createAsset, getAssets } from "../controllers/assetController.js";

const router = express.Router();

router.post("/", createAsset);
router.get("/", getAssets);

export default router;
