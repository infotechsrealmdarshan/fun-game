import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

export const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token missing" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try all common id keys
    const adminId = decoded.id || decoded._id || decoded.adminId;
    if (!adminId) return res.status(401).json({ message: "Invalid token payload" });

    const admin = await Admin.findById(adminId).select("-password");
    if (!admin) return res.status(401).json({ message: "Admin not found" });

    req.admin = decoded;     // raw JWT data
    req.adminData = admin;   // fresh DB data
    req.adminId = admin._id; // handy for other APIs

    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};