// config/socketConfig.js
import { Server } from "socket.io";
import { startGameTimer } from "../controllers/timerController.js";

let ioInstance = null;
let isInitialized = false;

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
    transports: ['websocket', 'polling']
  });

  ioInstance = io;
  isInitialized = true;

  console.log("✅ Socket.IO initialized");

  // Handle socket connections
  io.on("connection", (socket) => {
    console.log("🟢 User connected:", socket.id, "Total clients:", io.engine.clientsCount);
    
    // Send immediate welcome message
    socket.emit("welcome", {
      message: "Connected to game server",
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      serverTime: Date.now()
    });

    // Send test event to verify connection
    socket.emit("testEvent", {
      message: "Socket connection successful",
      type: "connection_test",
      timestamp: new Date().toISOString()
    });

    // Send immediate timer update to new connection
    if (global.currentGameState) {
      socket.emit("timerUpdate", global.currentGameState);
    }

    // Listen for client events
    socket.on("joinGame", (data) => {
      console.log("🎮 User joined game:", socket.id);
      socket.emit("gameJoined", {
        message: "Successfully joined the game",
        round: "current",
        timestamp: new Date().toISOString()
      });
    });

    socket.on("disconnect", (reason) => {
      console.log("🔴 User disconnected:", socket.id, "Reason:", reason, "Remaining clients:", io.engine.clientsCount);
    });

    socket.on("error", (error) => {
      console.log("❌ Socket error:", socket.id, error);
    });
  });

  // Start game timer after a short delay to ensure everything is ready
  setTimeout(() => {
    console.log("🎮 Starting game timer from socket config...");
    startGameTimer().then(() => {
      console.log("✅ Game timer started successfully from socket config");
    }).catch(err => {
      console.error("❌ Failed to start game timer:", err);
    });
  }, 1000);

  // Test event emitter (for debugging)
  setInterval(() => {
    if (io.engine.clientsCount > 0) {
      io.emit("heartbeat", {
        message: "Server heartbeat",
        timestamp: new Date().toISOString(),
        connectedClients: io.engine.clientsCount,
        serverUptime: process.uptime()
      });
    }
  }, 5000);

  return io;
};

export const getIO = () => {
  if (!ioInstance) {
    console.log("⚠️ Socket.IO instance not available yet");
  }
  return ioInstance;
};

export const emitToAll = (event, data) => {
  if (ioInstance && isInitialized) {
    // Store current game state for new connections
    if (event === "timerUpdate") {
      global.currentGameState = { ...data, event: event };
    }
    
    ioInstance.emit(event, data);
    console.log(`📡 [SOCKET] Emitted ${event} to ${ioInstance.engine.clientsCount} clients`);
  } else {
    console.log(`❌ No Socket.IO instance available for event: ${event}`);
  }
};

export const emitToRoom = (room, event, data) => {
  if (ioInstance && isInitialized) {
    ioInstance.to(room).emit(event, data);
  } else {
    console.log(`❌ No Socket.IO instance available for room event: ${event}`);
  }
};

// ✅ ADD THIS FUNCTION - Check if socket is ready
export const isSocketReady = () => {
  return ioInstance && isInitialized;
};