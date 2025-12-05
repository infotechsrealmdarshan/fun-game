// models/Round.js
import mongoose from "mongoose";

const roundSchema = new mongoose.Schema(
  {
    roundId: { type: String, required: true, unique: true, index: true },
    roundNumber: { type: Number, required: true, unique: true },
    phase: {
      type: String,
      enum: ["bidding", "calculating", "playSpin", "hold", "completed"], // ADD "playSpin" here
      default: "bidding"
    },
    winningNumber: { type: Number, default: null },
    status: {
      type: String,
      enum: ["running", "completed"],
      default: "running"
    },
    winnerAnnounced: { type: Boolean, default: false },
    startTime: { type: Date, default: Date.now },
    manualWinner: {
      type: Number,
      default: null
    },
    isManualWinner: {
      type: Boolean,
      default: false
    },
    calculatedWinningNumber: {
      type: Number,
      default: null
    },
    endTime: { type: Date, default: null }
  },
  { timestamps: true }
);

roundSchema.pre("validate", function (next) {
  if (!this.roundId && this.roundNumber) this.roundId = `ROUND_${this.roundNumber}`;
  next();
});

export default mongoose.model("Round", roundSchema);
