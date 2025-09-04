import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  { key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed },
  { timestamps: true }
);

export default mongoose.model("Setting", settingSchema);
