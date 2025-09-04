import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import routes from "./src/routes/index.js";
import { ok } from "./src/utils/response.js";
import { notFound, errorHandler } from "./src/middlewares/errorHandler.js";
import connectDB from "./src/config/db.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8800;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

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
});
