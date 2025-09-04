import mongoose from "mongoose";

const LoanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    amount: { type: Number, required: true },
    apr: { type: Number, required: true },
    durationDays: { type: Number, required: true },
    collateral: { type: String, required: true },
    startDate: { type: Date },
    dueDate: { type: Date },
    balance: { type: Number, required: true },
    status: { type: String, enum: ["Pending", "Active", "Repaid", "Overdue"], default: "Pending" },
    documents: {
      requested: { type: [String], default: [] },
      provided: {
        type: [
          {
            name: { type: String },
            key: { type: String },
            url: { type: String },
            uploadedAt: { type: Date, default: Date.now },
            verified: { type: Boolean, default: false },
          },
        ],
        default: [],
      },
    },
    downPayment: {
      required: { type: Boolean, default: false },
      amount: { type: Number, default: 0 },
      paid: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

const Loan = mongoose.models.Loan || mongoose.model("Loan", LoanSchema);

export default Loan;
