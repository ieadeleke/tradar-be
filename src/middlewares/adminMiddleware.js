import { fail } from "../utils/response.js";

export const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  return fail(res, { statusCode: 403, message: "Admin access required", error: "Forbidden" });
};

