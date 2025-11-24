import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema({
  globalReturnMultiplier: {
    type: Number,
    default: 10 
  },
  manualWinnerEnabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model("Settings", settingsSchema);