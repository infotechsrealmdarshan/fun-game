// middlewares/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import redisClient from "../config/redis.js";
import { errorResponse, successResponse } from "../utils/response.js";
import authHelper from "../utils/authHelper.js";

const auth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(res, "No token provided", 401);
  }

  const token = authHeader.split(" ")[1];
  const refreshToken = req.headers["x-refresh-token"];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user)
      return successResponse(res, "User not found", null, null, 200, 0);

    // Block access for soft-deleted accounts
    if (user.isDeleted) {
      return errorResponse(res, "Your account is deleted. Please contact support team.", 403);
    }

    req.user = {
      id: user._id,
      email: user.email,
      isAdmin: user.isAdmin,
    };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      if (!refreshToken) return errorResponse(res, "Access token expired", 401);

      try {
        const refreshDecoded = jwt.verify(
          refreshToken,
          process.env.JWT_SECRET
        );
        const stored = await redisClient.get(`refreshToken:${refreshDecoded.id}`);
        if (!stored || stored !== refreshToken)
          return errorResponse(res, "Invalid refresh token", 401);

        const user = await User.findById(refreshDecoded.id);
        if (!user) return errorResponse(res, "User not found", 404);

        // Block access for soft-deleted accounts on refresh
        if (user.isDeleted) {
          return errorResponse(res, "Your account is deleted. Please contact support team.", 403);
        }

        const newAccess = authHelper.generateAccessToken(user);
        res.setHeader("x-new-access-token", newAccess);
        req.user = { id: user._id, email: user.email, isAdmin: user.isAdmin };
        next();
      } catch {
        return errorResponse(res, "Invalid or expired refresh token", 401);
      }
    } else if (err.name === "JsonWebTokenError") {
      return errorResponse(res, "Invalid token", 401);
    } else {
      return errorResponse(res, "Token verification failed", 401);
    }
  }
};

export default auth;
