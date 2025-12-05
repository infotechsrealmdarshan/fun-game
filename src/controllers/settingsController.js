// controllers/settingsController.js
import Settings from "../models/Settings.js";
import Round from "../models/Round.js";

// Get current settings
export const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      // Create default settings if not exists
      settings = await Settings.create({});
    }

    return res.status(200).json({
      success: true,
      message: "Settings retrieved successfully",
      data: settings
    });
  } catch (err) {
    console.error("❌ getSettings error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Update settings (Admin only)
export const updateSettings = async (req, res) => {
  try {
    const { globalReturnMultiplier, manualWinnerEnabled } = req.body;

    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({
        globalReturnMultiplier: globalReturnMultiplier || 10,
        manualWinnerEnabled: manualWinnerEnabled !== undefined ? manualWinnerEnabled : true
      });
    } else {
      if (globalReturnMultiplier !== undefined) {
        settings.globalReturnMultiplier = globalReturnMultiplier;
      }

      if (manualWinnerEnabled !== undefined) {
        settings.manualWinnerEnabled = manualWinnerEnabled;
      }

      await settings.save();
    }

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      data: settings
    });
  } catch (err) {
    console.error("❌ updateSettings error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Set manual winner (Admin only) - UPDATED FOR 50s-57s WINDOW
export const setManualWinner = async (req, res) => {
  try {
    const { winningNumber } = req.body;

    if (winningNumber === undefined || winningNumber < 0 || winningNumber > 9) {
      return res.status(400).json({
        success: false,
        message: "Valid winning number (0-9) is required"
      });
    }

    const round = await Round.findOne({ status: "running" }).sort({ roundNumber: -1 });
    if (!round) {
      return res.status(400).json({
        success: false,
        message: "No active round running"
      });
    }

    // 🔥 ENHANCED DUPLICATE PREVENTION
    if (round.isManualWinner) {
      const existingManual = round.manualWinner === 10 ? 0 : round.manualWinner;
      return res.status(400).json({
        success: false,
        message: `Manual winner already set to ${existingManual} for this round`
      });
    }

    // 🔥 FIX: Use timer's internal elapsed time (not DB startTime)
    // Import the getCurrentElapsedTime function from timerController
    const { getCurrentElapsedTime } = await import("../controllers/timerController.js");
    const timerState = getCurrentElapsedTime();
    const elapsedSec = timerState.elapsedSeconds;
    const visibleTimeLeft = timerState.visibleTimeLeft;

    // Manual winner window: elapsed 50s-57s (visible time 10s-3s remaining)
    if (elapsedSec < 50 || elapsedSec > 57) {
      let errorMsg = "";
      if (elapsedSec < 50) {
        const waitSeconds = 50 - elapsedSec;
        errorMsg = `Too early! You can set manual winner when visible time reaches 10s. Please wait ${waitSeconds}s more.`;
      } else {
        errorMsg = `Too late! Manual winner window has closed. Please wait for the next round.`;
      }

      return res.status(400).json({
        success: false,
        message: errorMsg,
        details: {
          currentVisibleTime: `${visibleTimeLeft}s`,
          allowedWindow: "10s to 3s visible time",
          status: elapsedSec < 50 ? "too_early" : "too_late",
          nextOpportunity: elapsedSec < 50 ? `${50 - elapsedSec}s` : "Next round"
        },
      });
    }

    // Store manual winner
    round.manualWinner = winningNumber === 0 ? 10 : winningNumber;
    round.isManualWinner = true;
    await round.save();

    console.log(`🔧 MANUAL WINNER SET: Round ${round.roundNumber}, Number: ${winningNumber}`);

    // Emit event to all clients about manual winner confirmed
    const { emitToAll, isSocketReady } = await import("../config/socketConfig.js");
    if (isSocketReady()) {
      emitToAll("manualWinnerConfirmed", {
        roundNumber: round.roundNumber,
        winningNumber: winningNumber,
        message: "Admin has set manual winner",
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: "Manual winner set successfully",
      data: {
        roundNumber: round.roundNumber,
        winningNumber: winningNumber,
        elapsedSeconds: elapsedSec,
        visibleTimeLeft: visibleTimeLeft
      }
    });
  } catch (err) {
    console.error("❌ setManualWinner error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get return multiplier only
export const getReturnMultiplier = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({});
    }

    return res.status(200).json({
      success: true,
      message: "Return multiplier retrieved successfully",
      data: {
        globalReturnMultiplier: settings.globalReturnMultiplier
      }
    });
  } catch (err) {
    console.error("❌ getReturnMultiplier error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};