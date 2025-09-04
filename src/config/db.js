import mongoose from "mongoose";
// import { listenForDeposits } from "../services/blockchainListener";
import Wallet from "../models/walletModel.js";
import { addMany } from "../services/addressBook.js";
import { startDepositIndexer } from "../services/depositIndexer.js";


const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    // listenForDeposits();
    const addrs = (await Wallet.find({}, { address: 1, _id: 0 })).map(w => w.address);
    addMany(addrs);
    startDepositIndexer();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;
