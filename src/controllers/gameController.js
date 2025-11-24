// controllers/gameController.js
import Round from "../models/Round.js";
import Bid from "../models/Bid.js";
import User from "../models/User.js";

let gameRunning = false;

// ----------------------------------------------------
// GAME LOOP (bidding → hold → result)
// ----------------------------------------------------
async function startGameLoop() {
  while (gameRunning) {
    await startNewRound();
    await wait(45000); // 45s bidding
    await moveToHoldPhase();
    await wait(15000); // 15s hold (FIXED: should be 15s, not 5s)
    await completeRound();
    await wait(5000); // 5s result view
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ----------------------------------------------------
// CREATE NEW ROUND
// ----------------------------------------------------
async function startNewRound() {
  const lastRound = await Round.findOne().sort({ roundNumber: -1 });

  const newRound = new Round({
    roundNumber: lastRound ? lastRound.roundNumber + 1 : 1,
    phase: "bidding",
    status: "running",
    winnerAnnounced: false,
    startTime: new Date()
  });

  await newRound.save();

  console.log(`🎯 ROUND STARTED: ${newRound.roundNumber}`);
}

// ----------------------------------------------------
// MOVE TO HOLD PHASE
// ----------------------------------------------------
async function moveToHoldPhase() {
  const round = await Round.findOne({ status: "running" }).sort({
    roundNumber: -1
  });
  if (!round) return;

  round.phase = "hold";
  await round.save();

  console.log(`⏳ ROUND ${round.roundNumber} → HOLD PHASE`);
}

// ----------------------------------------------------
// COMPLETE ROUND
// ----------------------------------------------------
async function completeRound() {
  const round = await Round.findOne({ status: "running" }).sort({
    roundNumber: -1
  });

  if (!round) return;

  // 1) Calculate winning number USING YOUR EXACT RULES
  const winningNumber = await calculateWinningNumber(round._id);

  // 2) Update round
  round.phase = "completed";
  round.winnerAnnounced = true;
  round.status = "completed";
  round.winningNumber = winningNumber;
  round.endTime = new Date();
  await round.save();

  // 3) Give rewards
  await processRewards(round._id, winningNumber);

  console.log(`🏆 ROUND ${round.roundNumber} WINNER → ${winningNumber}`);
}

// ----------------------------------------------------
// WINNER SELECTION LOGIC (YOUR EXACT RULES)
// ----------------------------------------------------
async function calculateWinningNumber(roundId) {
  const bids = await Bid.find({ roundId });

  // Build counts for numbers 0-9
  const counts = {};
  for (let i = 0; i <= 9; i++) counts[i] = 0;
  
  for (const b of bids) {
    const n = Number(b.bidNumber);
    // Convert stored 10 back to 0 for counting
    const displayNumber = n === 10 ? 0 : n;
    if (displayNumber >= 0 && displayNumber <= 9) {
      counts[displayNumber] = (counts[displayNumber] || 0) + 1;
    }
  }

  console.log(`📊 Round bid counts:`, counts);

  let winningNumber;
  
  // STEP 1: Find FIRST number with ZERO users (check in order 0-9)
  for (let i = 0; i <= 9; i++) {
    if (counts[i] === 0) {
      winningNumber = i;
      break;
    }
  }

  // STEP 2: If no zero-user numbers, find LOWEST UNIQUE number
  if (winningNumber === undefined) {
    let lowestUnique = null;
    for (let i = 0; i <= 9; i++) {
      if (counts[i] === 1) {
        lowestUnique = i;
        break; // Take the first (lowest) unique number
      }
    }
    
    if (lowestUnique !== null) {
      winningNumber = lowestUnique;
    } else {
      // STEP 3: If no unique numbers, SMALLEST NUMBER (0) wins
      winningNumber = 0;
    }
  }

  // Convert for DB storage (0 -> 10)
  return winningNumber === 0 ? 10 : winningNumber;
}

// ----------------------------------------------------
// PAYOUT CALCULATION (YOUR EXACT REWARD RULES)
// ----------------------------------------------------
async function processRewards(roundId, winningNumber) {
  // Convert winning number for comparison (10 -> 0)
  const displayWinningNumber = winningNumber === 10 ? 0 : winningNumber;
  
  const winners = await Bid.find({ roundId, bidNumber: winningNumber });

  for (const bid of winners) {
    // REWARD CALCULATION: bid coins × bid number (0 = 10 for reward)
    const bidDisplayNumber = bid.bidNumber === 10 ? 0 : bid.bidNumber;
    const rewardMultiplier = bidDisplayNumber === 0 ? 10 : bidDisplayNumber;
    const rewardAmount = bid.coins * rewardMultiplier;

    bid.result = "win";
    bid.reward = rewardAmount;
    await bid.save();

    // Add reward to user's pendingWinningCoins
    await User.findByIdAndUpdate(bid.userId, {
      $inc: { pendingWinningCoins: rewardAmount }
    });
  }

  // Mark losers
  await Bid.updateMany(
    { roundId, bidNumber: { $ne: winningNumber } },
    { $set: { result: "lose", reward: 0 } }
  );
}

// ----------------------------------------------------
// GET CURRENT ROUND STATUS
// ----------------------------------------------------
export const getCurrentRoundStatus = async (req, res) => {
  try {
    const round = await Round.findOne({ status: "running" }).sort({ roundNumber: -1 });
    if (!round) return res.status(404).json({ message: "No active round found" });

    const elapsed = Math.floor((Date.now() - new Date(round.startTime).getTime()) / 1000);
    const timeRemaining = Math.max(0, 60 - elapsed);

    return res.status(200).json({
      roundNumber: round.roundNumber,
      phase: round.phase,
      status: round.status,
      timeRemaining,
      winningNumber: round.winningNumber === 10 ? 0 : round.winningNumber
    });
  } catch (err) {
    console.error("Error fetching round:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- Get Game Timer & Status ---------------- */
export const getGameTimerStatus = async (req, res) => {
  try {
    const round = await Round.findOne({ status: "running" }).sort({ roundNumber: -1 });

    // No active round
    if (!round) {
      return res.status(200).json({
        success: true,
        message: "Waiting for next round",
        data: {
          roundNumber: 0,
          phase: "waiting",
          timeLeft: 0,
          status: "waiting",
          winningNumber: null
        }
      });
    }

    // Timer logic
    const elapsed = Math.floor((Date.now() - new Date(round.startTime).getTime()) / 1000);
    const timeLeft = Math.max(0, 60 - elapsed);

    let phase = round.phase;
    if (timeLeft <= 15 && timeLeft > 0) phase = "hold";

    /* ---------------------------------------------
       WINNER LOGIC (IMPORTANT)
       Show winner during hold 3s → 1s
       OR after round completed.
    ----------------------------------------------*/

    let winningNumber = null;

    // 1️⃣ HOLD phase winner preview (timeLeft <= 3)
    if (phase === "hold" && timeLeft <= 3 && round.calculatedWinningNumber != null) {
      winningNumber =
        round.calculatedWinningNumber === 10
          ? 0
          : round.calculatedWinningNumber;
    }

    // 2️⃣ After round completed (official winner)
    else if (round.status === "completed" && round.winningNumber != null) {
      winningNumber =
        round.winningNumber === 10
          ? 0
          : round.winningNumber;
    }

    // If time finished, frontend waits for new round
    if (timeLeft === 0) {
      return res.status(200).json({
        success: true,
        data: {
          roundNumber: round.roundNumber + 1,
          phase: "waiting",
          timeLeft: 0,
          status: "waiting",
          winningNumber
        }
      });
    }

    // Final API response while running
    return res.status(200).json({
      success: true,
      data: {
        roundNumber: round.roundNumber,
        phase,
        timeLeft,
        status: "running",
        winningNumber
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};
