// controllers/bidController.js
import Round from "../models/Round.js";
import Bid from "../models/Bid.js";
import User from "../models/User.js";

// map 0 -> 10 (DB stores 10 instead of 0)
const mapInputToStored = (n) => (n === 0 ? 10 : n);

export const placeBid = async (req, res) => {
  try {
    // SAFELY EXTRACT USER ID
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in token",
      });
    }

    let { bidNumber, amount } = req.body;

    // Input validation
    if (typeof bidNumber !== "number" || bidNumber < 0 || bidNumber > 9) {
      return res.status(400).json({ success: false, message: "bidNumber must be between 0–9" });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ success: false, message: "amount must be > 0" });
    }

    const storedNumber = mapInputToStored(bidNumber);

    // Get active running round
    const round = await Round.findOne({ status: "running" }).sort({ roundNumber: -1 });

    if (!round) {
      return res.status(400).json({
        success: false,
        message: "No active round running",
      });
    }

    // Check bidding window (first 45 seconds) - UPDATED
    const elapsedSec = Math.floor((Date.now() - new Date(round.startTime).getTime()) / 1000);
    if (elapsedSec >= 45 || round.phase === "hold") {
      return res.status(400).json({
        success: false,
        message: "Bidding window closed (after 45 seconds)",
      });
    }

    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if user already placed a bid
    let existingBid = await Bid.findOne({ roundId: round._id, userId });

    if (existingBid) {
      // Update bid logic
      const previousAmount = existingBid.coins || 0;
      const diff = amount - previousAmount;

      // If increasing bid, deduct extra coins
      if (diff > 0) {
        if (user.coins < diff) {
          return res.status(400).json({ success: false, message: "Insufficient coins to increase bid" });
        }
        user.coins -= diff;
      }
      // If decreasing, refund coins
      else if (diff < 0) {
        user.coins += Math.abs(diff);
      }

      existingBid.bidNumber = storedNumber;
      existingBid.coins = amount;

      await existingBid.save();
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Bid updated successfully",
        data: existingBid,
        remainingCoins: user.coins,
      });
    }

    // New bid
    if (user.coins < amount) {
      return res.status(400).json({ success: false, message: "Insufficient coins to place bid" });
    }

    const newBid = await Bid.create({
      roundId: round._id,
      userId,
      bidNumber: storedNumber,
      coins: amount,
      result: "pending",
    });

    user.coins -= amount;
    await user.save();

    return res.status(201).json({
      success: true,
      message: "Bid placed successfully",
      data: newBid,
      remainingCoins: user.coins,
    });

  } catch (err) {
    console.error("❌ placeBid error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Bid already exists for this round",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
