// utils/errorHandler.js
import { errorResponse, successResponse } from "./response.js";

export const globalErrorHandler = (err, req, res, next) => {
  console.error("❌ Server Error:", err);

  if (process.env.NODE_ENV === "development") {
    console.error("Stack:", err.stack);
  }

  if (err.name === "ValidationError")
    return errorResponse(res, err.message, 400);

  if (err.name === "CastError") {
    const resourceName =
      (err.path || "").replace(/Id|ID/i, "") || "Resource";
    return successResponse(res, `${resourceName} not found`, null, null, 200, 0);
  }

  if (err.name === "JsonWebTokenError")
    return errorResponse(res, "Invalid token", 401);

  if (err.name === "TokenExpiredError")
    return errorResponse(res, "Token expired", 401);

  const message =
    process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

  return errorResponse(res, message, 500);
};
