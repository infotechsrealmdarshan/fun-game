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
// Set manual winner (Admin only)
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

    // Check if in hold phase
    if (round.phase !== "hold") {
      return res.status(400).json({
        success: false,
        message: "Manual winner can only be set during hold phase"
      });
    }

    // Store manual winner
    round.manualWinner = winningNumber === 0 ? 10 : winningNumber;
    round.isManualWinner = true;
    await round.save();

    return res.status(200).json({
      success: true,
      message: "Manual winner set successfully",
      data: {
        roundNumber: round.roundNumber,
        winningNumber: winningNumber
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