// config/socketConfig.js
import { Server } from "socket.io";
import { startGameTimer } from "../controllers/timerController.js";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { getLastTenWinnersForSocket } from "../utils/winnerHelper.js";

let ioInstance = null;
let isInitialized = false;
let connectionStats = {
  totalConnections: 0,
  activeConnections: 0,
  failedConnections: 0
};
let userSocketMap = new Map(); // Map to store userID -> socket connections

export const initializeSocket = (server) => {
  if (isInitialized) {
    console.log("⚠️ Socket.IO already initialized");
    return ioInstance;
  }

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    connectTimeout: 45000
  });

  ioInstance = io;
  isInitialized = true;

  console.log("✅ Socket.IO initialized with enhanced settings");

  // Handle socket connections with better error handling
  io.on("connection", async (socket) => {
    connectionStats.totalConnections++;
    connectionStats.activeConnections = io.engine.clientsCount;

    console.log(`🟢 User connected: ${socket.id}, Active: ${connectionStats.activeConnections}`);

    // Enhanced welcome with connection info
    socket.emit("welcome", {
      message: "Connected to game server",
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
      connectionId: connectionStats.totalConnections
    });

    // 🔥 NEW: Send last 10 winners on connect
    try {
      const winnersData = await getLastTenWinnersForSocket();

      // EMIT TO SPECIFIC SOCKET
      socket.emit("lastTenWinners", {
        success: true,
        data: winnersData,
        timestamp: new Date().toISOString()
      });

      console.log(`📊 Sent last 10 winners to new connection: ${winnersData.lastTenWinnersString}`);
    } catch (err) {
      console.error("❌ Error sending last 10 winners:", err);

      // Still emit even on error
      socket.emit("lastTenWinners", {
        success: false,
        data: { lastTenWinners: [], lastTenWinnersString: "" },
        message: "Could not fetch last winners",
        timestamp: new Date().toISOString()
      });
    }

    // Send current game state immediately
    if (global.currentGameState) {
      socket.emit("timerUpdate", global.currentGameState);
    }

    // Handle user authentication
    socket.on("authenticate", async (data) => {
      try {
        const { token } = data;
        if (!token) {
          socket.emit("authentication_failed", { message: "No token provided" });
          return;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
          socket.emit("authentication_failed", { message: "User not found" });
          return;
        }

        // Store user-socket mapping
        userSocketMap.set(user._id.toString(), socket.id);
        socket.userId = user._id.toString();

        socket.emit("authenticated", {
          success: true,
          message: "Authentication successful",
          user: {
            id: user._id,
            email: user.email,
            acnumber: user.acnumber
          },
          timestamp: new Date().toISOString()
        });

        console.log(`✅ User authenticated: ${user.email} (${user._id})`);

        // Send initial balance
        socket.emit("balanceUpdate", {
          success: true,
          message: "Initial balance",
          data: {
            coins: user.coins,
            pendingWinningCoins: user.pendingWinningCoins,
            totalBalance: user.coins + user.pendingWinningCoins,
            type: "initial"
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error("❌ Socket authentication error:", error);
        socket.emit("authentication_failed", { message: "Invalid token" });
      }
    });

    // Handle client events
    socket.on("joinGame", (data) => {
      console.log("🎮 User joined game:", socket.id);
      socket.emit("gameJoined", {
        message: "Successfully joined the game",
        round: "current",
        timestamp: new Date().toISOString()
      });
    });

    // Ping-pong for connection health
    socket.on("ping", (data) => {
      socket.emit("pong", {
        timestamp: new Date().toISOString(),
        serverTime: Date.now()
      });
    });

    socket.on("disconnect", (reason) => {
      if (socket.userId) {
        userSocketMap.delete(socket.userId);
        console.log(`🔴 User disconnected: ${socket.userId}, Reason: ${reason}`);
      } else {
        console.log(`🔴 Anonymous user disconnected: ${socket.id}, Reason: ${reason}`);
      }
      connectionStats.activeConnections = io.engine.clientsCount;
    });

    socket.on("error", (error) => {
      console.log("❌ Socket error:", socket.id, error);
      connectionStats.failedConnections++;
    });

    // Force clean up on socket close
    socket.on("close", () => {
      console.log("🔴 Socket closed:", socket.id);
    });
  });

  // Enhanced heartbeat with connection monitoring
  setInterval(() => {
    if (io.engine.clientsCount > 0) {
      io.emit("heartbeat", {
        message: "Server heartbeat",
        timestamp: new Date().toISOString(),
        connectedClients: io.engine.clientsCount,
        serverUptime: process.uptime(),
        connectionStats: connectionStats
      });
    }
  }, 10000); // Reduced to 10s for better monitoring

  // Start game timer after ensuring socket is ready
  setTimeout(() => {
    console.log("🎮 Starting game timer from socket config...");
    startGameTimer().then(() => {
      console.log("✅ Game timer started successfully from socket config");
    }).catch(err => {
      console.error("❌ Failed to start game timer:", err);
    });
  }, 2000);

  return io;
};

export const getIO = () => {
  if (!ioInstance) {
    throw new Error("Socket.IO instance not initialized");
  }
  return ioInstance;
};

export const emitToAll = (event, data) => {
  if (ioInstance && isInitialized) {
    // Store current game state for new connections
    if (event === "timerUpdate" || event === "phaseChange") {
      global.currentGameState = { ...data, event: event, lastUpdate: Date.now() };
    }

    ioInstance.emit(event, data);
    console.log(`📡 [SOCKET] Emitted ${event} to ${ioInstance.engine.clientsCount} clients`);
    return true;
  } else {
    console.log(`❌ No Socket.IO instance available for event: ${event}`);
    return false;
  }
};

export const emitToRoom = (room, event, data) => {
  if (ioInstance && isInitialized) {
    ioInstance.to(room).emit(event, data);
    return true;
  } else {
    console.log(`❌ No Socket.IO instance available for room event: ${event}`);
    return false;
  }
};

// 🔥 NEW: Emit to specific user
export const emitToUser = (userId, event, data) => {
  if (!ioInstance || !isInitialized) {
    console.log(`❌ Socket not ready for user event: ${event}`);
    return false;
  }

  const socketId = userSocketMap.get(userId);
  if (socketId) {
    ioInstance.to(socketId).emit(event, data);
    console.log(`📡 [USER] Emitted ${event} to user: ${userId}`);
    return true;
  } else {
    console.log(`⚠️ User ${userId} not connected for event: ${event}`);
    return false;
  }
};

export const isSocketReady = () => {
  return ioInstance && isInitialized;
};

export const getConnectionStats = () => {
  return {
    ...connectionStats,
    activeConnections: ioInstance ? ioInstance.engine.clientsCount : 0
  };
};