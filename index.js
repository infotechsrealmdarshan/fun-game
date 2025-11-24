import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import { Server } from "socket.io";
import userRoutes from "./src/routes/userRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import gameRoutes from "./src/routes/gameRoutes.js";
import redisClient from "./src/config/redis.js";
import connectDB from "./src/config/db.js";
import bidRoutes from "./src/routes/bidRoutes.js";
import { swaggerDocs } from "./src/swagger/swagger.js";
import { globalErrorHandler } from "./src/utils/errorHandler.js";
import { setSocketInstance, startGameTimer } from "./src/controllers/timerController.js";
import settingsRoutes from './src/routes/settingRoutes.js'

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
app.use("/api/settings", settingsRoutes)

// Swagger
swaggerDocs(app, process.env.PORT || 5000);

// Root
app.get("/", (req, res) => res.send("🚀 API is running..."));

// Global error handler
app.use(globalErrorHandler);

// ---------------------- SOCKET SERVER ---------------------- //
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

global.io = io;

// Handle socket connections
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// ✅ Auto Start Game Timer (resume from last round)
setSocketInstance(io);
startGameTimer(io);

// ------------------------------------------------------------ //
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
