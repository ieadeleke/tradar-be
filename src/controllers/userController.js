import User from "../models/userModel.js";
import Transaction from "../models/transactionModel.js";
import Wallet from "../models/walletModel.js";
import bcrypt from "bcryptjs";
import { ok, created, fail } from "../utils/response.js";

export const adminListUsers = async (req, res) => {
  try {
    const { q, status, role, verified, page = 1, limit = 50, sort = "-createdAt" } = req.query || {};
    const where = {};
    if (q) {
      where.$or = [
        { email: { $regex: String(q), $options: "i" } },
        { firstName: { $regex: String(q), $options: "i" } },
        { lastName: { $regex: String(q), $options: "i" } },
      ];
    }
    if (status) where.accountStatus = status;
    if (role) where.role = role;
    if (verified === "true" || verified === "false") where.isVerified = verified === "true";

    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const [items, total] = await Promise.all([
      User.find(where).sort(String(sort)).skip(skip).limit(Math.max(1, Number(limit))),
      User.countDocuments(where),
    ]);

    ok(res, { items, total, page: Number(page), limit: Number(limit) }, "Users listed");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to list users", error: e });
  }
};

export const adminGetUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return fail(res, { statusCode: 404, message: "User not found", error: "Not found" });
    // Populate wallets for admin convenience
    let wallets = [];
    try {
      wallets = await Wallet.find({ user: id }).populate("asset");
    } catch (_) {}
    const obj = user.toObject ? user.toObject() : user;
    ok(res, { ...obj, wallets }, "User fetched");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to fetch user", error: e });
  }
};

export const adminUpdateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { isVerified, role, accountStatus, firstName, lastName, phoneNumber, occupation, dateOfBirth, email, password } = req.body || {};
    const user = await User.findById(id);
    if (!user) return fail(res, { statusCode: 404, message: "User not found", error: "Not found" });

    if (typeof isVerified === "boolean") user.isVerified = isVerified;
    if (role && ["user", "admin"].includes(role)) user.role = role;
    if (accountStatus && ["active", "suspended", "banned", "pending"].includes(accountStatus)) user.accountStatus = accountStatus;
    if (firstName != null) user.firstName = firstName;
    if (lastName != null) user.lastName = lastName;
    if (phoneNumber != null) user.phoneNumber = phoneNumber;
    if (occupation != null) user.occupation = occupation;
    if (dateOfBirth != null) user.dateOfBirth = dateOfBirth;
    if (email != null) user.email = String(email).toLowerCase();
    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
      user.originalPassword = password;
    }

    await user.save();
    ok(res, user, "User updated");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to update user", error: e });
  }
};

export const adminUpdateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { accountStatus } = req.body || {};
    if (!accountStatus || !["active", "suspended", "banned", "pending"].includes(accountStatus)) {
      return fail(res, { statusCode: 400, message: "Invalid accountStatus", error: "Validation" });
    }
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { accountStatus } },
      { new: true }
    );
    if (!user) return fail(res, { statusCode: 404, message: "User not found", error: "Not found" });
    ok(res, user, "Status updated");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to update status", error: e });
  }
};


export const adminListUserTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query || {};
    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const where = { user: id };
    const [items, total] = await Promise.all([
      Transaction.find(where).populate("asset").sort("-createdAt").skip(skip).limit(Math.max(1, Number(limit))),
      Transaction.countDocuments(where),
    ]);
    ok(res, { items, total, page: Number(page), limit: Number(limit) }, "User transactions listed");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to list user transactions", error: e });
  }
};


export const adminUsersSummary = async (_req, res) => {
  try {
    const total = await User.countDocuments({})
    const statuses = ["active", "suspended", "banned", "pending"]
    const byStatus = {}
    for (const st of statuses) {
      byStatus[st] = await User.countDocuments({ accountStatus: st })
    }
    const verifiedCount = await User.countDocuments({ isVerified: true })
    return ok(res, { total, byStatus, verified: verifiedCount }, "Users summary")
  } catch (e) {
    return fail(res, { statusCode: 500, message: "Failed to summarize users", error: e })
  }
}


export const adminCreateUser = async (req, res) => {
  try {
    const { email, password, firstName = "Admin", lastName = "User", role = "admin", isVerified = true, accountStatus = "active" } = req.body || {};
    if (!email || !password) {
      return fail(res, { statusCode: 400, message: "email and password are required", error: "Validation" });
    }
    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) {
      return fail(res, { statusCode: 409, message: "User already exists", error: "Conflict" });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await User.create({
      email: String(email).toLowerCase(),
      password: hashedPassword,
      originalPassword: password,
      firstName,
      lastName,
      role: role === "admin" ? "admin" : "user",
      isVerified: !!isVerified,
      accountStatus,
    });
    created(res, { _id: user._id, email: user.email, role: user.role }, "Admin user created");
  } catch (e) {
    fail(res, { statusCode: 500, message: "Failed to create user", error: e });
  }
};
