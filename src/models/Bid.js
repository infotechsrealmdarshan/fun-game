import mongoose from "mongoose";

const bidSchema = new mongoose.Schema(
  {
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: "Round", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    bidNumber: { type: Number, required: true, min: 1, max: 10 },
    coins: { type: Number, min: 1, default: 0 },
    result: { type: String, enum: ["win", "lose", "pending"], default: "pending" },
    reward: { type: Number, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Bid", bidSchema);
