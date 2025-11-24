// utils/authHelper.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { errorResponse } from "./response.js";
dotenv.config();

class AuthHelper {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
  }

  generateAccessToken(user, expiry = process.env.JWT_ACCESS_TOKEN_EXPIRY || "7d") {
    return jwt.sign({ id: user._id || user.id }, this.jwtSecret, {
      expiresIn: expiry,
    });
  }

  generateRefreshToken(user, expiry = process.env.JWT_REFRESH_TOKEN_EXPIRY || "30d") {
    return jwt.sign({ id: user._id || user.id }, this.jwtSecret, {
      expiresIn: expiry,
    });
  }

  async verifyToken(token) {
    return new Promise((resolve) => {
      jwt.verify(token, this.jwtSecret, (err, decoded) => {
        if (err)
          return resolve({
            statusCode: 401,
            message:
              err.name === "TokenExpiredError"
                ? "Token expired"
                : "Invalid token",
            data: null,
          });
        resolve({
          statusCode: 200,
          status: 1,
          message: "Token verified",
          data: decoded,
        });
      });
    });
  }

  async validateAuth(req, res, next) {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return errorResponse(res, "Authorization token missing", 401);

      const result = await this.verifyToken(token);
      if (result.statusCode !== 200)
        return errorResponse(res, result.message, result.statusCode);

      req.user = result.data;
      next();
    } catch {
      return errorResponse(res, "Authentication failed", 500);
    }
  }
}

export default new AuthHelper();
