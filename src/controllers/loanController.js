import Loan from "../models/loanModel.js";
import { ok, created, fail } from "../utils/response.js";
import { presignPutUrl } from "../utils/s3.js";
import crypto from "crypto";

const OFFER_APR = {
  BTC: { 30: 8, 90: 10, 180: 12 },
  ETH: { 30: 8, 90: 10, 180: 12 },
  USDT: { 30: 8, 90: 10, 180: 12 },
};

const resolveApr = (collateral, durationDays) => {
  const map = OFFER_APR[collateral];
  if (!map) return null;
  return map[durationDays] ?? null;
};

const isLoanReadyForApproval = (loan) => {
  // All requested docs must be provided and verified
  const requested = new Set(loan.documents?.requested || []);
  const providedVerified = new Set((loan.documents?.provided || []).filter(d => d.verified).map(d => d.name));
  for (const reqName of requested) {
    if (!providedVerified.has(reqName)) return { ready: false, reason: `Missing verified document: ${reqName}` };
  }
  // Down payment fully paid if required
  if (loan.downPayment?.required) {
    const paid = Number(loan.downPayment.paid || 0);
    const due = Number(loan.downPayment.amount || 0);
    if (!(paid >= due)) return { ready: false, reason: "Down payment not fully paid" };
  }
  return { ready: true };
};

export const getLoans = async (req, res) => {
  try {
    const loans = await Loan.find({ user: req.user.id }).sort({ createdAt: -1 });
    ok(res, loans, "Loans fetched");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to fetch loans", error: err });
  }
};

export const requestLoan = async (req, res) => {
  try {
    const { amount, duration, collateral } = req.body || {};
    const amt = Number(amount);
    const durationDays = Number(duration);

    if (!amt || !durationDays || !collateral) {
      return fail(res, { statusCode: 400, message: "Missing fields: amount, duration, collateral", error: "Validation error" });
    }
    if (amt <= 0) {
      return fail(res, { statusCode: 400, message: "Amount must be greater than 0", error: "Validation error" });
    }

    const apr = resolveApr(collateral, durationDays);
    if (apr == null) {
      return fail(res, { statusCode: 400, message: "Invalid offer: unsupported duration or collateral", error: "Invalid offer" });
    }

    const loan = await Loan.create({
      user: req.user.id,
      amount: amt,
      apr,
      durationDays,
      collateral,
      balance: amt,
      status: "Pending",
    });

    created(res, loan, "Loan requested");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Loan request failed", error: err });
  }
};

export const repayLoan = async (req, res) => {
  try {
    const { loanId, amount } = req.body || {};
    const repay = Number(amount);
    if (!loanId || !repay) {
      return fail(res, { statusCode: 400, message: "Missing fields: loanId, amount", error: "Validation error" });
    }
    if (repay <= 0) {
      return fail(res, { statusCode: 400, message: "Amount must be greater than 0", error: "Validation error" });
    }

    const loan = await Loan.findOne({ _id: loanId, user: req.user.id });
    if (!loan) {
      return fail(res, { statusCode: 404, message: "Loan not found", error: "Loan not found" });
    }

    if (loan.status !== "Active") {
      return fail(res, { statusCode: 400, message: "Loan is not active", error: "Invalid status" });
    }

    const newBalance = Math.max(0, (loan.balance ?? 0) - repay);
    loan.balance = newBalance;
    if (newBalance <= 0) loan.status = "Repaid";
    await loan.save();

    ok(res, loan, "Loan repaid");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Repayment failed", error: err });
  }
};

// User: get a presigned S3 URL to upload a document
export const getDocumentUploadUrl = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { name, contentType } = req.body || {};
    if (!name || !contentType) {
      return fail(res, { statusCode: 400, message: "Missing fields: name, contentType", error: "Validation error" });
    }

    const loan = await Loan.findOne({ _id: loanId, user: req.user.id });
    if (!loan) {
      return fail(res, { statusCode: 404, message: "Loan not found", error: "Loan not found" });
    }

    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
      return fail(res, { statusCode: 500, message: "S3 bucket not configured", error: "Config error" });
    }

    const safeName = String(name).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const key = `loans/${loanId}/${crypto.randomUUID()}-${safeName}`;
    const uploadUrl = await presignPutUrl({ Bucket: bucket, Key: key, ContentType: contentType, expiresIn: 900 });
    const url = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    ok(res, { uploadUrl, key, url, contentType }, "Presigned URL generated");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to generate upload URL", error: err });
  }
};

// User: confirm an uploaded document (attach to loan)
export const confirmDocumentUpload = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { name, url, key } = req.body || {};
    if (!name || !url || !key) {
      return fail(res, { statusCode: 400, message: "Missing fields: name, url, key", error: "Validation error" });
    }

    const loan = await Loan.findOne({ _id: loanId, user: req.user.id });
    if (!loan) {
      return fail(res, { statusCode: 404, message: "Loan not found", error: "Loan not found" });
    }

    loan.documents.provided.push({ name, url, uploadedAt: new Date(), verified: false, key });
    await loan.save();
    ok(res, loan, "Document attached");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to confirm document", error: err });
  }
};

// Get requested vs provided documents for a loan
export const getLoanDocuments = async (req, res) => {
  try {
    const { loanId } = req.params;
    const loan = await Loan.findById(loanId).populate({ path: "user", select: "_id role" });
    if (!loan) {
      return fail(res, { statusCode: 404, message: "Loan not found", error: "Loan not found" });
    }
    const isOwner = loan.user?._id?.toString() === req.user.id?.toString();
    const isAdmin = req.user?.role === "admin";
    if (!isOwner && !isAdmin) {
      return fail(res, { statusCode: 403, message: "Forbidden", error: "Forbidden" });
    }
    const requested = loan.documents?.requested || [];
    const provided = loan.documents?.provided || [];
    const verifiedProvidedNames = new Set(provided.filter(d => d.verified).map(d => d.name));
    const missing = requested.filter(r => !verifiedProvidedNames.has(r));
    const readyInfo = isLoanReadyForApproval(loan);
    ok(res, { requested, provided, missing, readyForApproval: readyInfo.ready, status: loan.status, downPayment: loan.downPayment }, "Loan documents fetched");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to fetch loan documents", error: err });
  }
};

// Admin: request documents for a loan
export const adminRequestDocuments = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { documents } = req.body || {};
    if (!Array.isArray(documents) || documents.length === 0) {
      return fail(res, { statusCode: 400, message: "'documents' must be a non-empty array of strings", error: "Validation error" });
    }

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return fail(res, { statusCode: 404, message: "Loan not found", error: "Loan not found" });
    }

    loan.documents.requested = Array.from(new Set([...(loan.documents.requested || []), ...documents]));
    await loan.save();
    ok(res, loan, "Documents requested");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to request documents", error: err });
  }
};

// Admin: request an initial down payment
export const adminRequestDownPayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { amount } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return fail(res, { statusCode: 400, message: "'amount' must be a positive number", error: "Validation error" });
    }

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return fail(res, { statusCode: 404, message: "Loan not found", error: "Loan not found" });
    }

    loan.downPayment.required = true;
    loan.downPayment.amount = amt;
    if (loan.downPayment.paid == null) loan.downPayment.paid = 0;
    await loan.save();
    ok(res, loan, "Down payment requested");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to request down payment", error: err });
  }
};

// Admin: verify a provided document by subdocument id
export const adminVerifyDocument = async (req, res) => {
  try {
    const { loanId, docId } = req.params;
    const { verified = true } = req.body || {};

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return fail(res, { statusCode: 404, message: "Loan not found", error: "Loan not found" });
    }

    const doc = loan.documents.provided.id(docId);
    if (!doc) {
      return fail(res, { statusCode: 404, message: "Document not found", error: "Document not found" });
    }

    doc.verified = !!verified;
    await loan.save();
    ok(res, loan, "Document verification updated");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to verify document", error: err });
  }
};

// User: record a down payment toward requirement
export const recordDownPayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { amount } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return fail(res, { statusCode: 400, message: "'amount' must be a positive number", error: "Validation error" });
    }

    const loan = await Loan.findOne({ _id: loanId, user: req.user.id });
    if (!loan) {
      return fail(res, { statusCode: 404, message: "Loan not found", error: "Loan not found" });
    }

    if (!loan.downPayment.required) {
      return fail(res, { statusCode: 400, message: "Down payment not required", error: "Invalid operation" });
    }

    loan.downPayment.paid = (loan.downPayment.paid || 0) + amt;
    await loan.save();
    ok(res, loan, "Down payment recorded");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to record down payment", error: err });
  }
};

// Admin: approve a loan when requirements are met
export const adminApproveLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return fail(res, { statusCode: 404, message: "Loan not found", error: "Loan not found" });
    }

    if (loan.status !== "Pending") {
      return fail(res, { statusCode: 400, message: "Loan is not pending", error: "Invalid status" });
    }

    const readyInfo = isLoanReadyForApproval(loan);
    if (!readyInfo.ready) {
      return fail(res, { statusCode: 400, message: readyInfo.reason || "Requirements not met", error: "Not ready" });
    }

    const start = new Date();
    const due = new Date(start);
    due.setDate(due.getDate() + Number(loan.durationDays || 0));
    loan.startDate = start;
    loan.dueDate = due;
    loan.status = "Active";
    await loan.save();
    ok(res, loan, "Loan approved");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to approve loan", error: err });
  }
};

// Admin: list pending loans ready for approval
export const adminListPendingLoansReady = async (req, res) => {
  try {
    const pending = await Loan.find({ status: "Pending" }).sort({ createdAt: -1 });
    const ready = [];
    for (const loan of pending) {
      const { ready: isReady } = isLoanReadyForApproval(loan);
      if (isReady) ready.push(loan);
    }
    ok(res, ready, "Pending loans ready for approval");
  } catch (err) {
    fail(res, { statusCode: 500, message: "Failed to list loans", error: err });
  }
};
