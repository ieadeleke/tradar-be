import User from "../models/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { encryptSecret, decryptSecret } from "../utils/crypto.js";
import { generateEthWallet } from "../utils/generateWallet.js";
import walletModel from "../models/walletModel.js";
import { addAddress } from "../services/addressBook.js";
import { sendMail } from "../utils/mailer.js";
import { ok, created, fail } from "../utils/response.js";

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Register user
export const registerUser = (async (req, res) => {
    const {
        firstName,
        lastName,
        emailAddress,
        phoneNumber,
        occupation,
        dateOfBirth,
        payoutMethod,
    } = req.body;

    // 1. Check if user exists
    const userExists = await User.findOne({ email: emailAddress });
    if (userExists) {
        res.status(400);
        throw new Error("User already exists");
    }

    // 2. Hash password (if you include it in form later)
    // For now, let's auto-generate a random password (you can replace with actual form input)
    const rawPassword = Math.random().toString(36).slice(-8);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 3. Create user
    const user = await User.create({
        firstName,
        lastName,
        email: emailAddress,
        phoneNumber: phoneNumber,
        occupation,
        dateOfBirth,
        payoutMethod,
        password: hashedPassword,
        originalPassword: rawPassword
    });

    if (user) {
        const { address, privateKey } = generateEthWallet();

        // Get current balance from blockchain
        const encPrivKey = encryptSecret(privateKey);

        await walletModel.create({
            user: user._id,
            address,
            encPrivKey,
            asset: "ETH",
            balance: 0,
        });

        // make deposit listener aware immediately
        addAddress(address);
        // 4. Send welcome email
        await sendMail({
            to: user.email,
            subject: "Welcome to Moneday 🚀",
            html: `
        <h2>Hello ${user.firstName},</h2>
        <p>Welcome to Moneday! 🎉</p>
        <p>Your account has been created successfully. Next, set up your trading account and start earning.</p>
        <p><b>Login email:</b> ${user.email}</p>
        <p><b>Temporary password:</b> ${rawPassword}</p>
        <p><b>Your ETH wallet address:</b> ${address}</p>
        <p>We recommend changing your password after first login.</p>
        <br/>
        <p>Happy Trading,</p>
        <p>The Moneday Team</p>
      `,
        });

        // 5. Return response
        created(res, {
            _id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            token: generateToken(user.id),
            password: rawPassword,
        }, "User registered");
    } else {
        res.status(400);
        throw new Error("Invalid user data");
    }
});

// Login user
export const login = async (req, res, next) => {
    try {
        const { emailAddress, password } = req.body;
        const user = await User.findOne({ email: emailAddress });
        const valid = user && (await user.matchPassword(password));
        if (!valid) {
            return fail(res, { statusCode: 401, message: "Invalid credentials", error: "Invalid credentials" });
        }

        ok(res, {
            _id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            occupation: user.occupation,
            dateOfBirth: user.dateOfBirth,
            token: generateToken(user._id),
        }, "Login successful");
    } catch (err) {
        fail(res, { statusCode: 500, message: "Login failed", error: err });
    }
};

export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return fail(res, { statusCode: 404, message: "User not found", error: "User not found" });
    }

    const { firstName, lastName, phoneNumber, occupation, dateOfBirth } = req.body;

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phoneNumber = phoneNumber || user.phoneNumber;
    user.occupation = occupation || user.occupation;
    user.dateOfBirth = dateOfBirth || user.dateOfBirth;

    const updatedUser = await user.save();

    ok(res, {
      _id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      phoneNumber: updatedUser.phone,
      occupation: updatedUser.occupation,
      dateOfBirth: updatedUser.dateOfBirth,
    }, "Profile updated");
  } catch (error) {
    fail(res, { statusCode: 500, message: "Failed to update profile", error: error });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return fail(res, { statusCode: 404, message: "User not found", error: "User not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return fail(res, { statusCode: 400, message: "Old password is incorrect", error: "Old password is incorrect" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    await user.save();
    ok(res, null, "Password updated successfully");
  } catch (error) {
    fail(res, { statusCode: 500, message: "Failed to change password", error: error });
  }
};


export const updatePaymentMethod = async (req, res) => {
  try {
    const { payoutMethod } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return fail(res, { statusCode: 404, message: "User not found", error: "User not found" });
    }

    user.payoutMethod = payoutMethod || user.payoutMethod;

    const updatedUser = await user.save();

    ok(res, {
      _id: updatedUser.id,
      payoutMethod: updatedUser.payoutMethod,
    }, "Payment method updated");
  } catch (error) {
    fail(res, { statusCode: 500, message: "Failed to update payment method", error: error });
  }
};
