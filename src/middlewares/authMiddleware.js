import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import { fail } from "../utils/response.js";

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        return fail(res, { statusCode: 401, message: "User not found", error: "User not found" });
      }

      next();
    } catch (error) {
      console.error(error);
      return fail(res, { statusCode: 401, message: "Not authorized, invalid token", error: "Invalid token" });
    }
  }

  if (!token) {
    return fail(res, { statusCode: 401, message: "Not authorized, no token", error: "No token" });
  }
};
