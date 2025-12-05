// controllers/bidController.js
import Round from "../models/Round.js";
import Bid from "../models/Bid.js";
import User from "../models/User.js";
import { emitToUser, isSocketReady, emitToAll } from "../config/socketConfig.js";

// map 0 -> 10 (DB stores 10 instead of 0)
const mapInputToStored = (n) => (n === 0 ? 10 : n);
export const placeBid = async (req, res) => {
  try {
    // Get user ID safely
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in token",
      });
    }

    let { bidNumber, amount } = req.body;

    // Validate inputs
    if (typeof bidNumber !== "number" || bidNumber < 0 || bidNumber > 9) {
      return res.status(400).json({
        success: false,
        message: "bidNumber must be between 0-9",
      });
    }

    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount must be a number greater than 0",
      });
    }

    // Convert 0 to stored value 10
    const storedNumber = bidNumber === 0 ? 10 : bidNumber;

    // Find running round
    const round = await Round.findOne({ status: "running" }).sort({ roundNumber: -1 });

    if (!round) {
      return res.status(400).json({
        success: false,
        message: "No active round running",
      });
    }

    // Check bidding phase
    if (round.phase !== "bidding" || round.biddingLocked) {
      return res.status(400).json({
        success: false,
        message: `Bidding not allowed. Phase: ${round.phase}, Locked: ${round.biddingLocked}`,
      });
    }

    // Fetch user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check user balance
    if (user.coins < amount) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: `Insufficient balance to place bid`,
        userBalance: user.coins,
        requiredAmount: amount,
        shortBy: amount - user.coins,
      });
    }

    // ALWAYS create new bid (unlimited)
    user.coins -= amount;

    const newBid = await Bid.create({
      roundId: round._id,
      userId,
      bidNumber: storedNumber,
      coins: amount,
      result: "pending",
      reward: null,
    });

    await user.save();

    // Realtime balance update event - broadcast to all connected clients
    if (isSocketReady()) {
      // Emit placeBid event with bid balance details to all clients
      emitToAll("placeBid", {
        success: true,
        message: "Bid placed successfully",
        data: {
          bidId: newBid._id,
          userId: userId.toString(),
          roundNumber: round.roundNumber,
          roundId: round._id,
          bidNumber,
          bidAmount: amount,
          currentCoins: user.coins,
          pendingWinningCoins: user.pendingWinningCoins,
          totalBalance: user.coins + user.pendingWinningCoins,
          totalBidsInRound: await Bid.countDocuments({ roundId: round._id }),
        },
        timestamp: new Date().toISOString(),
      });

      // Also emit user's balance update
      emitToAll("balanceUpdate", {
        success: true,
        message: "New bid placed",
        data: {
          userId: userId.toString(),
          coins: user.coins,
          pendingWinningCoins: user.pendingWinningCoins,
          totalBalance: user.coins + user.pendingWinningCoins,
          bidAmount: amount,
          bidNumber,
          type: "bid_placed",
          roundNumber: round.roundNumber,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(201).json({
      success: true,
      message: "Bid created successfully",
      data: {
        _id: newBid._id,
        roundId: newBid.roundId,
        userId: newBid.userId,
        bidNumber,
        coins: newBid.coins,
        result: newBid.result,
        reward: newBid.reward,
        createdAt: newBid.createdAt,
        updatedAt: newBid.updatedAt,
      },
      remainingCoins: user.coins,
      action: "created",
    });

  } catch (err) {
    console.error("placeBid error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};


// Get all bids for current round (admin only or user's own)
export const getRoundBids = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { roundId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in token",
      });
    }

    let query = {};

    // If roundId is provided, get bids for that round
    if (roundId) {
      query.roundId = roundId;
    } else {
      // Otherwise, get active round
      const round = await Round.findOne({ status: "running" }).sort({ roundNumber: -1 });
      if (!round) {
        return res.status(200).json({
          success: true,
          message: "No active round running",
          data: []
        });
      }
      query.roundId = round._id;
    }

    // Check if user is admin (you need to implement this check based on your auth)
    const isAdmin = req.user?.role === 'admin'; // Adjust based on your user model

    if (!isAdmin) {
      // Regular users can only see their own bids
      query.userId = userId;
    }

    const bids = await Bid.find(query)
      .populate('userId', 'email acnumber')
      .populate('roundId', 'roundNumber phase')
      .sort({ createdAt: -1 });

    // Format the response
    const formattedBids = bids.map(bid => ({
      _id: bid._id,
      roundId: bid.roundId?._id,
      roundNumber: bid.roundId?.roundNumber,
      userId: bid.userId?._id,
      userEmail: bid.userId?.email,
      userAcNumber: bid.userId?.acnumber,
      bidNumber: bid.bidNumber === 10 ? 0 : bid.bidNumber,
      coins: bid.coins,
      result: bid.result,
      reward: bid.reward,
      isManualWinner: bid.isManualWinner || false,
      createdAt: bid.createdAt,
      updatedAt: bid.updatedAt
    }));

    return res.status(200).json({
      success: true,
      message: "Bids retrieved successfully",
      data: formattedBids,
      count: formattedBids.length
    });

  } catch (err) {
    console.error("❌ getRoundBids error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get bidding statistics for current round
export const getBiddingStats = async (req, res) => {
  try {
    // Get active running round
    const round = await Round.findOne({ status: "running" }).sort({ roundNumber: -1 });

    if (!round) {
      return res.status(200).json({
        success: true,
        message: "No active round running",
        data: {
          roundNumber: 0,
          phase: "waiting",
          totalBids: 0,
          totalCoins: 0,
          bidDistribution: {},
          canPlaceBid: false
        }
      });
    }

    // Get all bids for this round
    const bids = await Bid.find({ roundId: round._id });

    // Calculate statistics
    const totalBids = bids.length;
    const totalCoins = bids.reduce((sum, bid) => sum + bid.coins, 0);

    // Calculate bid distribution (0-9)
    const bidDistribution = {};
    for (let i = 0; i <= 9; i++) {
      bidDistribution[i] = 0;
    }

    bids.forEach(bid => {
      const displayNumber = bid.bidNumber === 10 ? 0 : bid.bidNumber;
      if (displayNumber >= 0 && displayNumber <= 9) {
        bidDistribution[displayNumber] = (bidDistribution[displayNumber] || 0) + 1;
      }
    });

    // Check if user can place bid (for frontend)
    const canPlaceBid = round.phase === "bidding" && !round.biddingLocked;

    return res.status(200).json({
      success: true,
      message: "Bidding statistics retrieved successfully",
      data: {
        roundNumber: round.roundNumber,
        phase: round.phase,
        biddingLocked: round.biddingLocked || false,
        totalBids,
        totalCoins,
        bidDistribution,
        canPlaceBid,
        timeLeft: round.timeLeft || 0
      }
    });

  } catch (err) {
    console.error("❌ getBiddingStats error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};