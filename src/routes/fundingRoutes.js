import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import crypto from "crypto";
import { protect } from "../middlewares/authMiddleware.js";
import { admin } from "../middlewares/adminMiddleware.js";
import Funding from "../models/fundingModel.js";
import Wallet from "../models/walletModel.js";
import { ok, created, fail } from "../utils/response.js";
import { isS3Enabled, s3Upload, s3PresignedGetUrl, s3PublicUrl } from "../utils/s3.js";

const router = express.Router();

function getBankDetails() {
  return {
    bankName: process.env.BANK_NAME || "",
    accountName: process.env.BANK_ACCOUNT_NAME || "",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || "",
    iban: process.env.BANK_IBAN || "",
    swift: process.env.BANK_SWIFT || "",
    currency: process.env.BANK_CURRENCY || "USD",
  };
}

function resolveCryptoAddress(asset, network) {
  const key = `${String(asset || "").toUpperCase()}_${String(network || "").toUpperCase()}`;
  const envKey = `CRYPTO_ADDR_${key}`;
  return process.env[envKey] || "";
}

async function getOrCreateWallet(userId) {
  // Reuse existing on-chain wallet as the main off-chain account store
  const w = await Wallet.findOne({ user: userId });
  return w;
}

// Public bank details
router.get("/bank-details", (_req, res) => {
  return ok(res, getBankDetails(), "Bank details");
});

// Public crypto deposit address by asset+network
router.get("/crypto-address", (req, res) => {
  const { asset, network } = req.query || {};
  if (!asset || !network) return fail(res, { statusCode: 400, message: "asset and network are required", error: "Validation" });
  const address = resolveCryptoAddress(asset, network);
  if (!address) return fail(res, { statusCode: 404, message: "No deposit address configured for this asset/network", error: "Not Found" });
  return ok(res, { address, asset, network }, "Crypto deposit address");
});

// Create funding request (bank/crypto/paypal)
router.post("/request", protect, async (req, res) => {
  try {
    const { method, amount, asset, network, meta } = req.body || {};
    const amt = Number(amount);
    if (!method || !amt || amt <= 0) return fail(res, { statusCode: 400, message: "Invalid method or amount", error: "Validation" });
    if (!["bank", "crypto", "paypal"].includes(method)) return fail(res, { statusCode: 400, message: "Unsupported method", error: "Validation" });
    const fr = await Funding.create({ user: req.user.id, method, amount: amt, asset: asset || "USD", network, status: "pending", meta });
    return created(res, fr, "Funding request created");
  } catch (e) {
    console.error("[funding/request]", e);
    return fail(res, { statusCode: 500, message: "Failed to create funding request", error: e });
  }
});

// User: list my funding requests
router.get("/my-requests", protect, async (req, res) => {
  try {
    const list = await Funding.find({ user: req.user.id }).sort({ createdAt: -1 });
    return ok(res, list, "My funding requests");
  } catch (e) {
    console.error("[funding/my-requests]", e);
    return fail(res, { statusCode: 500, message: "Failed to list requests", error: e });
  }
});

// Admin: list all requests
router.get("/requests", protect, admin, async (req, res) => {
  try {
    const q = {};
    if (req.query.status) q.status = req.query.status;
    const list = await Funding.find(q).sort({ createdAt: -1 }).limit(200);
    return ok(res, list, "Funding requests");
  } catch (e) {
    console.error("[funding/requests]", e);
    return fail(res, { statusCode: 500, message: "Failed to list requests", error: e });
  }
});

// Admin: approve and credit wallet
router.post("/:id/approve", protect, admin, async (req, res) => {
  try {
    const { id } = req.params;
    const fr = await Funding.findById(id);
    if (!fr) return fail(res, { statusCode: 404, message: "Not found", error: "Not found" });
    if (fr.status !== "pending") return fail(res, { statusCode: 400, message: "Already processed", error: "State" });

    const wallet = await getOrCreateWallet(fr.user);
    if (!wallet) return fail(res, { statusCode: 400, message: "Wallet not found", error: "Wallet" });
    wallet.balance = Number(wallet.balance || 0) + Number(fr.amount);
    // Do not change wallet.asset; it's app-wide ETH-based wallet used for off-chain accounting
    await wallet.save();
    fr.status = "approved";
    await fr.save();
    return ok(res, { funding: fr, wallet }, "Funding approved");
  } catch (e) {
    console.error("[funding/approve]", e);
    return fail(res, { statusCode: 500, message: "Approval failed", error: e });
  }
});

// Admin: reject
router.post("/:id/reject", protect, admin, async (req, res) => {
  try {
    const { id } = req.params;
    const fr = await Funding.findById(id);
    if (!fr) return fail(res, { statusCode: 404, message: "Not found", error: "Not found" });
    if (fr.status !== "pending") return fail(res, { statusCode: 400, message: "Already processed", error: "State" });
    fr.status = "rejected";
    fr.meta = { ...(fr.meta || {}), rejectReason: req.body?.reason || "" };
    await fr.save();
    return ok(res, fr, "Funding rejected");
  } catch (e) {
    console.error("[funding/reject]", e);
    return fail(res, { statusCode: 500, message: "Rejection failed", error: e });
  }
});

// Upload payment proof (bank transfers)
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Use memory storage to support S3 uploads when configured
const memoryStorage = multer.memoryStorage();
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + file.originalname.replace(/\s+/g, "_"));
  },
});
const storage = isS3Enabled() ? memoryStorage : diskStorage;
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/:id/proof", protect, upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const fr = await Funding.findById(id);
    if (!fr) return fail(res, { statusCode: 404, message: "Not found", error: "Not found" });
    if (String(fr.user) !== String(req.user.id)) return fail(res, { statusCode: 403, message: "Forbidden", error: "Forbidden" });
    if (!req.file) return fail(res, { statusCode: 400, message: "Missing file", error: "Validation" });
    let proof = {};
    if (isS3Enabled() && req.file?.buffer) {
      const ext = path.extname(req.file.originalname || "");
      const key = `funding/${id}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
      await s3Upload({ key, body: req.file.buffer, contentType: req.file.mimetype || "application/octet-stream" });
      const publicUrl = s3PublicUrl(key);
      const signedUrl = publicUrl ? undefined : await s3PresignedGetUrl(key, 7 * 24 * 3600);
      proof = {
        url: publicUrl || signedUrl,
        filename: path.basename(key),
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: key,
      };
    } else {
      const urlBase = process.env.UPLOADS_PUBLIC_BASE || "";
      proof = {
        url: urlBase ? `${urlBase}/${path.basename(req.file.path)}` : undefined,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
      };
    }
    fr.proof = proof;
    fr.markModified("proof");
    await fr.save();
    return ok(res, fr, "Proof uploaded");
  } catch (e) {
    console.error("[funding/proof]", e);
    return fail(res, { statusCode: 500, message: "Upload failed", error: e });
  }
});

// Admin: funding summary (counts and sums)
router.get("/summary", protect, admin, async (_req, res) => {
  try {
    const pipeline = [
      { $group: { _id: { status: "$status", method: "$method" }, count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ];
    const rows = await Funding.aggregate(pipeline);
    const byStatus = {};
    const byMethod = {};
    for (const r of rows) {
      const { status, method } = r._id || {};
      byStatus[status] = byStatus[status] || { count: 0, total: 0 };
      byStatus[status].count += r.count;
      byStatus[status].total += r.total;
      byMethod[method] = byMethod[method] || { count: 0, total: 0 };
      byMethod[method].count += r.count;
      byMethod[method].total += r.total;
    }
    return ok(res, { byStatus, byMethod }, "Funding summary");
  } catch (e) {
    console.error("[funding/summary]", e);
    return fail(res, { statusCode: 500, message: "Failed to summarize", error: e });
  }
});

export default router;
