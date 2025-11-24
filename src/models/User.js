// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    acnumber: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobile: { type: String, required: true },
    coins: { type: Number, default: 1000 },            
    pendingWinningCoins: { type: Number, default: 0 }, 
    totalSection: { type: Number, default: 0 },
    daySection: { type: Number, default: 0 },
    roundSection: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
