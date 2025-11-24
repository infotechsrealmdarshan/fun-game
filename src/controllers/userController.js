import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { successResponse, errorResponse } from "../utils/response.js";
import authHelper from "../utils/authHelper.js";
import redisClient from "../config/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/* ---------------- Register User ---------------- */
export const registerUser = async (req, res) => {
  try {
    const { acnumber, email, password, mobile } = req.body;

    if (!acnumber || !email || !password || !mobile) {
      return errorResponse(
        res,
        "acnumber, email, password and mobile are required",
        400
      );
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, "Email already exists", 400);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      acnumber,
      email,
      password: hashedPassword,
      mobile,
      coins: 1000, 
    });

    await newUser.save();

    const accessToken = jwt.sign(
      { id: newUser._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return successResponse(
      res,
      "User registered successfully",
      {
        accessToken,
        user: {
          _id: newUser._id,
          acnumber: newUser.acnumber,
          email: newUser.email,
          mobile: newUser.mobile,
          coins: newUser.coins, 
          createdAt: newUser.createdAt,
        },
      },
      null,
      201,
      1
    );
  } catch (err) {
    console.error("Register Error:", err);
    return errorResponse(res, "Server error", 500);
  }
};

/* ---------------- Login User ---------------- */
export const loginUser = async (req, res) => {
  try {
    const { acnumber, password } = req.body;
    const user = await User.findOne({ acnumber }).select("+password");

    if (!user)
      return successResponse(res, "User not found", null, null, 200, 0);

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return successResponse(res, "Invalid credentials", null, null, 200, 0);

    const accessToken = authHelper.generateAccessToken(user);
    const refreshToken = authHelper.generateRefreshToken(user);

    await redisClient.set(
      `refreshToken:${user._id}`,
      refreshToken,
      "EX",
      7 * 24 * 60 * 60
    );

    const userData = user.toObject();
    delete userData.password;

    return successResponse(
      res,
      "Login successful",
      { accessToken, user: userData }, // ✅ Removed refresh token
      null,
      200,
      1
    );
  } catch (err) {
    return errorResponse(res, err.message || "Server error", 500);
  }
};

/* ---------------- Get Profile ---------------- */
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user)
      return successResponse(res, "User not found", null, null, 200, 0);

    return successResponse(res, "Profile retrieved successfully", { user }, null, 200, 1);
  } catch (err) {
    return errorResponse(res, err.message || "Server error", 500);
  }
};

/* ---------------- Admin: Get All Users ---------------- */
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    return successResponse(res, "All users fetched successfully", { users }, null, 200, 1);
  } catch (err) {
    return errorResponse(res, err.message || "Server error", 500);
  }
};

/* ---------------- Admin: Get Single User ---------------- */
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user)
      return successResponse(res, "User not found", null, null, 200, 0);

    return successResponse(res, "User details fetched successfully", { user }, null, 200, 1);
  } catch (err) {
    return errorResponse(res, err.message || "Server error", 500);
  }
};

/* ---------------- Admin: Delete User ---------------- */
export const deleteUserById = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user)
      return successResponse(res, "User not found", null, null, 200, 0);

    await redisClient.del(`refreshToken:${req.params.id}`);

    return successResponse(res, "User deleted successfully", null, null, 200, 1);
  } catch (err) {
    return errorResponse(res, err.message || "Server error", 500);
  }
};

/* ---------------- Refresh Access Token ---------------- */
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return successResponse(res, "Refresh token required", null, null, 400, 0);

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return successResponse(res, "Invalid or expired refresh token", null, null, 401, 0);
    }

    const storedToken = await redisClient.get(`refreshToken:${decoded.id}`);
    if (!storedToken || storedToken !== refreshToken)
      return successResponse(res, "Refresh token expired or revoked", null, null, 401, 0);

    const newAccessToken = jwt.sign({ id: decoded.id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    return successResponse(res, "Access token refreshed successfully", { accessToken: newAccessToken }, null, 200, 1);
  } catch (err) {
    return errorResponse(res, err.message || "Server error", 500);
  }
};

// In userController.js - claimWinnings function
export const claimWinnings = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // No winnings to claim
    if (user.pendingWinningCoins <= 0) {
      return res.status(400).json({
        success: false,
        message: "No winning balance to claim",
      });
    }

    const winnings = user.pendingWinningCoins;

    // Move winnings → coins
    user.coins += winnings;

    // Reset pending winning balance
    user.pendingWinningCoins = 0;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Winnings claimed successfully",
      claimedAmount: winnings,
      totalCoins: user.coins,
      pendingWinningCoins: 0
    });

  } catch (err) {
    console.error("❌ claimWinnings error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/* ---------------- Get User Winning Balance ---------------- */
export const getWinningBalance = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    const user = await User.findById(userId).select('coins pendingWinningCoins');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Winning balance retrieved successfully",
      data: {
        coins: user.coins || 0,
        pendingWinningCoins: user.pendingWinningCoins || 0,
        totalBalance: (user.coins || 0) + (user.pendingWinningCoins || 0)
      }
    });

  } catch (err) {
    console.error("❌ getWinningBalance error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};