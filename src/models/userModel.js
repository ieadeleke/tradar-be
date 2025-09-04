import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
    {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        readyToStartEarning: { type: String },
        phoneNumber: { type: String },
        occupation: { type: String },
        dateOfBirth: { type: String },
        payoutMethod: { type: String },
        email: { type: String, required: true, unique: true, lowercase: true },
        password: { type: String, required: true, minlength: 6 },
        originalPassword: { type: String, required: true, minlength: 6 },
        role: { type: String, enum: ["user", "admin"], default: "user" },
        isVerified: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Password hashing
// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   this.password = await bcrypt.hash(this.password, 10);
//   next();
// });

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
