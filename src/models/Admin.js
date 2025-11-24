import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    profileImg: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Admin", adminSchema);
