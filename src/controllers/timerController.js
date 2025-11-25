// controllers/timerController.js
import Round from "../models/Round.js";
import Bid from "../models/Bid.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import { emitToAll, isSocketReady } from "../config/socketConfig.js";

let currentRound = null;
let phase = "bidding";
let timeLeft = 60;
let timerRunning = false;
let winnerCalculated = false;
let calculatedWinner = null;

/* ---------------------------------------------------
   START GAME TIMER
----------------------------------------------------*/
export const startGameTimer = async () => {
  if (timerRunning) {
    console.log("⚠️ Game timer already running");
    return;
  }
  
  timerRunning = true;

  console.log("🎮 Game Timer Starting...");

  try {
    currentRound = await Round.findOne().sort({ roundNumber: -1 });

    if (!currentRound) {
      currentRound = await Round.create({
        roundNumber: 1,
        roundId: "ROUND_1",
        phase: "bidding",
        status: "running",
        startTime: new Date()
      });
      console.log("✅ Created first round:", currentRound.roundNumber);
    } else if (currentRound.status === "completed") {
      const next = currentRound.roundNumber + 1;
      currentRound = await Round.create({
        roundNumber: next,
        roundId: `ROUND_${next}`,
        phase: "bidding",
        status: "running",
        startTime: new Date()
      });
      console.log("✅ Created new round:", currentRound.roundNumber);
    } else {
      phase = currentRound.phase || "bidding";
      console.log("✅ Resumed existing round:", currentRound.roundNumber);
    }

    const computeTimeLeft = () => {
      if (!currentRound.startTime) {
        currentRound.startTime = new Date();
        currentRound.save();
        return 60;
      }
      const elapsed = Math.floor((Date.now() - new Date(currentRound.startTime).getTime()) / 1000);
      return Math.max(0, 60 - elapsed);
    };

    timeLeft = computeTimeLeft();
    winnerCalculated = false;
    calculatedWinner = null;

    console.log(`⏰ Starting timer: Round ${currentRound.roundNumber}, TimeLeft: ${timeLeft}s, Phase: ${phase}`);
    console.log(`📡 Socket ready: ${isSocketReady()}`);

    // Start the tick function
    tick();

  } catch (err) {
    console.error("❌ Error starting game timer:", err);
    timerRunning = false;
  }
};

/* ---------------------------------------------------
   TICK FUNCTION (MAIN GAME LOOP)
----------------------------------------------------*/
const tick = async () => {
  try {
    if (!timerRunning) return;

    // Phase update
    let displayPhase = phase;
    if (timeLeft <= 15 && timeLeft > 0 && phase === "bidding") {
      displayPhase = "hold";
    }

    // Send timer update via Socket.IO
     const timerData = {
      roundNumber: currentRound?.roundNumber || 0,
      phase: displayPhase,
      timeLeft,
      status: "running",
      winningNumber: 
        phase === "hold" && calculatedWinner
          ? (calculatedWinner.storedWinningNumber === 10 ? 0 : calculatedWinner.storedWinningNumber)
          : null,
      timestamp: new Date().toISOString()
    };
    
    emitToAll("timerUpdate", timerData);
    console.log(`📡 Emitted timerUpdate: Round ${timerData.roundNumber}, Time: ${timerData.timeLeft}s`);
    
    // Only emit if socket is ready
    if (isSocketReady()) {
      emitToAll("timerUpdate", timerData);
      console.log(`📡 Emitted timerUpdate: Round ${timerData.roundNumber}, Time: ${timerData.timeLeft}s`);
    } else {
      console.log(`⏰ Timer update (Socket not ready): Round ${timerData.roundNumber}, Time: ${timerData.timeLeft}s`);
    }

    // Enter hold phase
    if (timeLeft === 15 && phase !== "hold") {
      phase = "hold";
      if (currentRound) {
        currentRound.phase = "hold";
        await currentRound.save();
      }
      
      if (isSocketReady()) {
        emitToAll("phaseChange", {
          roundNumber: currentRound?.roundNumber || 0,
          phase: "hold",
          timestamp: new Date().toISOString()
        });
        console.log(`🔄 Phase changed to HOLD`);
      }
      
      winnerCalculated = false;
      calculatedWinner = null;
    }

    // Calculate winner at 5 seconds remaining
    if (phase === "hold" && timeLeft === 5 && !winnerCalculated && currentRound) {
      console.log("🎯 Calculating winner @5s");
      try {
        const winnerData = await calculateWinner(currentRound._id);
        calculatedWinner = winnerData;
        winnerCalculated = true;

        currentRound.calculatedWinningNumber = winnerData.storedWinningNumber;
        await currentRound.save();
        console.log("✅ Winner calculated:", winnerData.winningNumber);
      } catch (error) {
        console.error("❌ Error calculating winner:", error);
      }
    }

    // Winner preview at 3,2,1 seconds
    if (phase === "hold" && timeLeft <= 5 && timeLeft >= 1 && currentRound) {
      let preview = currentRound.calculatedWinningNumber === 10 ? 0 : currentRound.calculatedWinningNumber;

      if (isSocketReady()) {
        emitToAll("winnerPreview", {
          roundNumber: currentRound.roundNumber,
          winningNumber: preview,
          phase: "hold",
          timeLeft,
          timestamp: new Date().toISOString()
        });
        console.log(`🎯 Winner preview: ${preview} (${timeLeft}s)`);
      }
    }

    // Finalize round when time reaches 0
    if (timeLeft <= 0 && currentRound) {
      console.log(`⏳ Finalizing Round #${currentRound.roundNumber}`);
      try {
        let winnerData = calculatedWinner;
        if (!winnerCalculated) {
          winnerData = await calculateWinner(currentRound._id);
        }
        await finalizeRound(winnerData);
      } catch (error) {
        console.error("❌ Error finalizing round:", error);
        await startNewRound();
      }
      return;
    }

    // Continue to next second
    timeLeft -= 1;
    setTimeout(tick, 1000);

  } catch (err) {
    console.error("🔥 Critical error in tick function:", err);
    timeLeft = Math.max(0, timeLeft - 1);
    setTimeout(tick, 1000);
  }
};

/* ---------------------------------------------------
   CALCULATE WINNER
----------------------------------------------------*/
const calculateWinner = async (roundId) => {
  try {
    const bids = await Bid.find({ roundId });
    const settings = await Settings.findOne();

    const counts = {};
    for (let i = 0; i <= 9; i++) counts[i] = 0;

    for (const b of bids) {
      const v = b.bidNumber == 10 ? 0 : Number(b.bidNumber);
      counts[v]++;
    }

    console.log("📊 BID COUNT:", counts);

    let winningNumber;
    const round = await Round.findById(roundId);

    if (round.isManualWinner && round.manualWinner) {
      winningNumber = round.manualWinner == 10 ? 0 : round.manualWinner;
    } else {
      const zeroDigits = Object.keys(counts).filter(k => counts[k] === 0).map(Number);

      if (zeroDigits.length) {
        winningNumber = zeroDigits[Math.floor(Math.random() * zeroDigits.length)];
      } else {
        const unique = Object.keys(counts)
          .filter(k => counts[k] === 1)
          .map(Number);

        if (unique.length) {
          winningNumber = unique[0];
        } else {
          winningNumber = 0;
        }
      }
    }

    const storedWinningNumber = winningNumber === 0 ? 10 : winningNumber;

    await Round.findByIdAndUpdate(roundId, {
      calculatedWinningNumber: storedWinningNumber
    });

    return {
      winningNumber,
      storedWinningNumber,
      bids,
      counts
    };
  } catch (error) {
    console.error("❌ Error in calculateWinner:", error);
    return {
      winningNumber: 0,
      storedWinningNumber: 10,
      bids: [],
      counts: {}
    };
  }
};

/* ---------------------------------------------------
   FINALIZE ROUND
----------------------------------------------------*/
const finalizeRound = async (winnerData) => {
  try {
    const { winningNumber, storedWinningNumber, bids } = winnerData;
    const settings = await Settings.findOne();

    const matched = bids.filter(b => {
      const v = b.bidNumber == 10 ? 0 : Number(b.bidNumber);
      return v === winningNumber;
    });

    let winnerUserId = null;
    let winnerBidId = null;
    let reward = 0;

    if (matched.length > 0) {
      const pick = matched[Math.floor(Math.random() * matched.length)];
      winnerUserId = pick.userId;
      winnerBidId = pick._id;

      const multiplier = settings?.globalReturnMultiplier || 10;
      reward = pick.coins * multiplier;

      await User.findByIdAndUpdate(winnerUserId, {
        $inc: { pendingWinningCoins: reward }
      });

      await Bid.findByIdAndUpdate(winnerBidId, {
        $set: { result: "win", reward }
      });
    }

    const losers = bids
      .filter(b => String(b._id) !== String(winnerBidId))
      .map(b => b._id);

    if (losers.length) {
      await Bid.updateMany(
        { _id: { $in: losers } },
        { result: "lose", reward: 0 }
      );
    }

    if (currentRound) {
      currentRound.status = "completed";
      currentRound.winningNumber = winningNumber;
      currentRound.endTime = new Date();
      await currentRound.save();
    }

    emitToAll("roundResult", {
      roundNumber: currentRound?.roundNumber || 0,
      winningNumber,
      winnerUserId,
      reward,
      isFinal: true,
      timestamp: new Date().toISOString()
    });
    console.log(`🏁 Round result emitted: Winner ${winningNumber}`);

    console.log(`🏁 Round #${currentRound?.roundNumber} completed. Winner: ${winningNumber}`);

    // Short break before next round
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // Start new round
    await startNewRound();

  } catch (err) {
    console.error("❌ finalizeRound Error:", err);
    await startNewRound();
  }
};

/* ---------------------------------------------------
   START NEW ROUND
----------------------------------------------------*/
const startNewRound = async () => {
  try {
    const nextRoundNumber = currentRound ? currentRound.roundNumber + 1 : 1;
    
    currentRound = await Round.create({
      roundNumber: nextRoundNumber,
      roundId: `ROUND_${nextRoundNumber}`,
      phase: "bidding",
      status: "running",
      startTime: new Date()
    });

    timeLeft = 60;
    phase = "bidding";
    winnerCalculated = false;
    calculatedWinner = null;

    console.log(`🔄 New Round Started: #${currentRound.roundNumber}`);

    emitToAll("newRound", {
      roundNumber: currentRound.roundNumber,
      timeLeft: 60,
      phase: "bidding",
      status: "running",
      timestamp: new Date().toISOString()
    });
    console.log(`🔄 New round emitted: #${currentRound.roundNumber}`);

    // Continue ticking
    setTimeout(tick, 1000);

  } catch (error) {
    console.error("❌ Error starting new round:", error);
    setTimeout(startNewRound, 5000);
  }
};

/* ---------------------------------------------------
   GET CURRENT TIMER STATUS (for debugging)
----------------------------------------------------*/
export const getTimerStatus = () => {
  return {
    timerRunning,
    currentRound: currentRound ? {
      roundNumber: currentRound.roundNumber,
      status: currentRound.status,
      phase: currentRound.phase
    } : null,
    timeLeft,
    phase,
    winnerCalculated,
    connectedClients: 0 // This will be handled by socketConfig
  };
};