// server.js (or index.js)
import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import { initializeSocket } from "./src/config/socketConfig.js";
import userRoutes from "./src/routes/userRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import gameRoutes from "./src/routes/gameRoutes.js";
import redisClient from "./src/config/redis.js";
import connectDB from "./src/config/db.js";
import bidRoutes from "./src/routes/bidRoutes.js";
import { swaggerDocs } from "./src/swagger/swagger.js";
import { globalErrorHandler } from "./src/utils/errorHandler.js";
import settingsRoutes from './src/routes/settingRoutes.js';

dotenv.config();

// Express app
const app = express();

// MongoDB
connectDB();

// Redis
redisClient.on("connect", () => console.log("✅ Redis connected successfully"));

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));
app.use("/uploads", express.static("uploads"));

// Routes
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/bid", bidRoutes);
app.use("/api/settings", settingsRoutes);

// Swagger
swaggerDocs(app, process.env.PORT || 5000);

// Root
app.get("/", (req, res) => res.send("🚀 API is running..."));

// Global error handler
app.use(globalErrorHandler);

// ---------------------- SOCKET SERVER ---------------------- //
const server = http.createServer(app);

// IMPORTANT: Initialize Socket.IO FIRST
const io = initializeSocket(server);

// ------------------------------------------------------------ //
const PORT = process.env.PORT || 5000;

// Start server only after everything is initialized
server.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`📡 Socket.IO server ready for connections`);
});