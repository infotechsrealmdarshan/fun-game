import Admin from "../models/Admin.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { successResponse, errorResponse } from "../utils/response.js";
import crypto from "crypto";
import { sendEmail } from "../utils/sendEmail.js";

// 🔹 Generate JWT Token
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

/**
 * 🔹 Admin Login
 */
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return successResponse(
        res,
        "Email and password are required",
        null,
        null,
        200,
        0
      );

    const admin = await Admin.findOne({ email }).select("+password");
    if (!admin)
      return successResponse(res, "Admin not found", null, null, 200, 0);

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid)
      return successResponse(res, "Invalid credentials", null, null, 200, 0);

    const token = generateToken(admin._id);

    // Prepare response (don’t include password or accessToken)
    const adminData = admin.toObject();
    delete adminData.password;
    delete adminData.accessToken;

    return successResponse(
      res,
      "Login successful",
      { accessToken: token, admin: adminData },
      null,
      200,
      1
    );
  } catch (err) {
    console.error("Admin login error:", err);
    return errorResponse(res, err.message || "Server error", 500);
  }
};

/**
 * 🔹 Create Admin
 */
export const createAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, password, profileImg } = req.body;

    if (!firstName || !lastName || !email || !password)
      return successResponse(
        res,
        "All fields are required",
        null,
        null,
        200,
        0
      );

    const existing = await Admin.findOne({ email });
    if (existing)
      return successResponse(res, "Admin already exists", null, null, 200, 0);

    const hashed = await bcrypt.hash(password, 10);
    const admin = await Admin.create({
      firstName,
      lastName,
      email,
      password: hashed,
      profileImg,
    });

    const token = generateToken(admin._id);

    // Prepare response (clean admin data)
    const adminData = admin.toObject();
    delete adminData.password;
    delete adminData.accessToken;

    return successResponse(
      res,
      "Admin created successfully",
      { accessToken: token, admin: adminData },
      null,
      201,
      1
    );
  } catch (err) {
    console.error("Create admin error:", err);
    return errorResponse(res, err.message || "Server error", 500);
  }
};

/**
 * 🔹 Update Admin Profile (no password change here)
 */
export const updateAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, profileImg } = req.body;
    const adminId = req.admin.id;

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (profileImg) updateData.profileImg = profileImg;

    const updatedAdmin = await Admin.findByIdAndUpdate(
      adminId,
      { $set: updateData },
      { new: true }
    ).select("-password");

    return successResponse(
      res,
      "Admin updated successfully",
      updatedAdmin,
      null,
      200,
      1
    );
  } catch (err) {
    console.error("Update admin error:", err);
    return errorResponse(res, err.message || "Server error", 500);
  }
};
/**
 * 🔹 Get Admin Profile
 */
export const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("-password");
    if (!admin)
      return successResponse(res, "Admin not found", null, null, 200, 0);

    return successResponse(
      res,
      "Profile fetched successfully",
      admin,
      null,
      200,
      1
    );
  } catch (err) {
    console.error("Get profile error:", err);
    return errorResponse(res, err.message || "Server error", 500);
  }
};

/**
 * 🔹 Forgot Password (Send Reset Link)
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return successResponse(res, "Email is required", null, null, 200, 0);

    const admin = await Admin.findOne({ email });
    if (!admin)
      return successResponse(res, "Admin not found", null, null, 200, 0);

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    admin.resetToken = resetToken;
    admin.resetTokenExpiry = resetTokenExpiry;
    await admin.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Password Reset Request</h2>
        <p>Hi ${admin.firstName || "Admin"},</p>
        <p>You requested to reset your password. Click the button below to proceed:</p>
        <a href="${resetUrl}" style="display: inline-block; background-color: #007BFF; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Reset Password</a>
        <p>This link will expire in <strong>10 minutes</strong>.</p>
        <p>If you did not request this, please ignore this email.</p>
        <hr/>
        <p>Regards,<br/>Admin Panel Team</p>
      </div>
    `;

    await sendEmail(admin.email, "Password Reset Request", html);

    return successResponse(
      res,
      "Password reset email sent successfully",
      null,
      null,
      200,
      1
    );
  } catch (err) {
    console.error("Forgot password error:", err);
    return errorResponse(res, err.message || "Server error", 500);
  }
};

/**
 * 🔹 Reset Password (Verify Token & Set New Password)
 */
export const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password)
      return successResponse(
        res,
        "Password is required",
        null,
        null,
        200,
        0
      );

    // adminAuth middleware already verified the token and set req.adminId
    const admin = await Admin.findById(req.adminId);
    if (!admin)
      return successResponse(res, "Admin not found", null, null, 200, 0);

    const hashedPassword = await bcrypt.hash(password, 10);
    admin.password = hashedPassword;
    await admin.save();

    return successResponse(res, "Password reset successful", null, null, 200, 1);
  } catch (err) {
    console.error("Reset password error:", err);
    return errorResponse(res, err.message || "Server error", 500);
  }
};
