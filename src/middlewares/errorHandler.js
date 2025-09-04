import { respond } from "../utils/response.js";

export const notFound = (req, res, next) => {
  const err = new Error(`Not Found - ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  const message = err.message || "Server Error";
  const error = process.env.NODE_ENV === "production" ? { message } : { message, stack: err.stack };
  respond(res, { statusCode, message, data: null, error, success: false });
};

