import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import routes from "./src/routes/index.js";
import { ok } from "./src/utils/response.js";
import { notFound, errorHandler } from "./src/middlewares/errorHandler.js";
import connectDB from "./src/config/db.js";
import path from "path";
import fs from "fs";
import { startAutoTradeRunner } from "./src/jobs/autoTradeRunner.js";

// Load environment variables
dotenv.config();

// Guard against unexpected unhandled errors bringing down the process
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err?.message || err);
});

const app = express();
const PORT = process.env.PORT || 8800;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// Static uploads (optional)
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  app.use("/uploads", express.static(uploadDir));
} catch (_) {}

connectDB();
// API routes
app.use("/api", routes);

// Root route
app.get("/", (req, res) => {
  ok(res, { service: "backend", status: "running" }, "Service healthy");
});

// 404 and Error handlers
app.use(notFound);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Start background autotrade runner (Mongo-backed). Safe for multi-instance due to locking.
  try { startAutoTradeRunner({ intervalMs: 5000 }); } catch (e) { console.error('Failed to start autotrade runner', e?.message || e); }
});
