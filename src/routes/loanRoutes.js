import express from "express";
import { getLoans, requestLoan, repayLoan, adminRequestDocuments, adminRequestDownPayment, getDocumentUploadUrl, confirmDocumentUpload, adminVerifyDocument, recordDownPayment, adminApproveLoan, getLoanDocuments, adminListPendingLoansReady, adminLoansSummary, adminListLoansByUser } from "../controllers/loanController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { admin } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Fixed admin routes should be before dynamic :loanId routes
router.get("/admin/pending-ready", protect, admin, adminListPendingLoansReady);
router.get("/admin/by-user/:userId", protect, admin, adminListLoansByUser);
router.get("/admin/summary", protect, admin, adminLoansSummary);

router.get("/", protect, getLoans);
router.post("/request", protect, requestLoan);
router.post("/repay", protect, repayLoan);
router.post("/:loanId/documents/presign", protect, getDocumentUploadUrl);
router.post("/:loanId/documents/confirm", protect, confirmDocumentUpload);
router.get("/:loanId/documents", protect, getLoanDocuments);
router.post("/:loanId/documents/:docId/verify", protect, admin, adminVerifyDocument);
router.post("/:loanId/downpayment/pay", protect, recordDownPayment);
router.post("/:loanId/approve", protect, admin, adminApproveLoan);
router.post("/:loanId/request-documents", protect, admin, adminRequestDocuments);
router.post("/:loanId/request-downpayment", protect, admin, adminRequestDownPayment);

export default router;
