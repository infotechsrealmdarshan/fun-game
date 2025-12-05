// controllers/timerController.js
import Round from "../models/Round.js";
import Bid from "../models/Bid.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import { emitToAll, emitToUser, isSocketReady } from "../config/socketConfig.js"; // Added emitToUser

let currentRound = null;
let phase = "bidding";
let timeLeft = 68; // Start from 68s
let timerRunning = false;
let winnerCalculated = false;
let calculatedWinner = null;

// EXACT TIMELINE - 68s TOTAL CYCLE
const TIMELINE = {
  TOTAL_ROUND_TIME: 68,      // 68 seconds total cycle
  BIDDING_TIME: 57,          // 57 seconds bidding (68s to 11s)
  WINNER_CALCULATION_TIME: 3, // 3 seconds calculate (11s to 8s)
  SPIN_ANIMATION_TIME: 5,     // 5 seconds spin (8s to 3s) - ONLY FOR SPINNER
  HOLD_TIME: 3,              // 3 seconds hold (3s to 0s)
  MANUAL_WINNER_WINDOW: 7    // 7 seconds for manual winner (50s to 57s)
};

/* ---------------------------------------------------
   START GAME TIMER
----------------------------------------------------*/
export const startGameTimer = async () => {
  if (timerRunning) {
    console.log("⚠️ Game timer already running");
    return;
  }
  
  timerRunning = true;

  console.log("🎮 Game Timer Starting with 68s CYCLE...");
  console.log("⏰ Timeline: 68s→50s:Bid → 50s→57s:ManualWinner → 57s:Close → 11s→8s:Calc → 8s:PlaySpin → 3s→0s:Hold");

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

    timeLeft = TIMELINE.TOTAL_ROUND_TIME;
    winnerCalculated = false;
    calculatedWinner = null;

    console.log(`⏰ Starting timer: Round ${currentRound.roundNumber}, TimeLeft: ${timeLeft}s`);
    
    // Start the tick function
    tick();

  } catch (err) {
    console.error("❌ Error starting game timer:", err);
    timerRunning = false;
  }
};

/* ---------------------------------------------------
   TICK FUNCTION - UPDATED WITH MANUAL WINNER WINDOW
----------------------------------------------------*/
const tick = async () => {
  try {
    if (!timerRunning) return;

    let displayPhase = phase;
    let displayStatus = "running";
    let displayWinningNumber = null;
    
    // 1. BIDDING PHASE (68s to 11s) - 57 seconds
    if (timeLeft > (TIMELINE.TOTAL_ROUND_TIME - TIMELINE.BIDDING_TIME)) {
      displayPhase = "bidding";
      displayStatus = "running";
      
      // 🔥 FIXED: Manual Winner Window - Emit only once at 50s
      if (timeLeft === (TIMELINE.TOTAL_ROUND_TIME - 50)) {
        if (isSocketReady() && currentRound) {
          emitToAll("manualWinnerWindow", {
            roundNumber: currentRound.roundNumber,
            message: "Manual winner window open (50s-57s) - Admin can set winner",
            windowOpen: true,
            timeLeft: timeLeft,
            timeRemaining: 7, // Fixed 7 seconds window
            timestamp: new Date().toISOString()
          });
          console.log(`🔧 MANUAL WINNER WINDOW OPEN: Round ${currentRound.roundNumber}, 50s-57s`);
        }
      }
    }
    // 2. CALCULATE WINNER (at exactly 11s remaining)
    else if (timeLeft === (TIMELINE.TOTAL_ROUND_TIME - TIMELINE.BIDDING_TIME)) {
      displayPhase = "calculating";
      displayStatus = "calculating";
      
      if (isSocketReady()) {
        emitToAll("phaseChange", {
          roundNumber: currentRound?.roundNumber || 0,
          phase: "calculating",
          message: "Bidding stopped - Calculating winner",
          timestamp: new Date().toISOString()
        });
        console.log(`🔄 EMITTED phaseChange: calculating (Bidding STOPPED)`);
      }
      
      await calculateWinnerImmediately();
    }
    // 3. During winner calculation (11s to 8s remaining)
    else if (timeLeft > (TIMELINE.TOTAL_ROUND_TIME - TIMELINE.BIDDING_TIME - TIMELINE.WINNER_CALCULATION_TIME)) {
      displayPhase = "calculating";
      displayStatus = "calculating";
    }
    // 4. PLAY SPIN PHASE (at exactly 8s remaining)
    else if (timeLeft === (TIMELINE.TOTAL_ROUND_TIME - TIMELINE.BIDDING_TIME - TIMELINE.WINNER_CALCULATION_TIME)) {
      displayPhase = "playSpin";
      displayStatus = "playSpin";
      await triggerPlaySpinPhase();
    }
    // 5. During spin animation (8s to 3s remaining)
    else if (timeLeft > TIMELINE.HOLD_TIME) {
      displayPhase = "playSpin";
      displayStatus = "playSpin";
      
      // 🔥 FIX: Show winning number during playSpin phase if calculated
      if (calculatedWinner) {
        displayWinningNumber = calculatedWinner.storedWinningNumber === 10 ? 0 : calculatedWinner.storedWinningNumber;
      }
    }
    // 6. HOLD PHASE (at exactly 3s remaining)
    else if (timeLeft === TIMELINE.HOLD_TIME) {
      displayPhase = "hold";
      displayStatus = "hold";
      await triggerRoundCompleteAndHold();
    }
    // 7. During hold phase (3s to 0s remaining)
    else if (timeLeft > 0) {
      displayPhase = "hold";
      displayStatus = "hold";
      
      // 🔥 FIX: Show winning number during hold phase
      if (calculatedWinner) {
        displayWinningNumber = calculatedWinner.storedWinningNumber === 10 ? 0 : calculatedWinner.storedWinningNumber;
      }
    }
    // 8. END CYCLE & START NEW ROUND (at 0s)
    else if (timeLeft === 0) {
      await startNewRound();
      return;
    }

    // Send timer update via Socket.IO
    const timerData = {
      roundNumber: currentRound?.roundNumber || 0,
      phase: displayPhase,
      timeLeft: timeLeft,
      status: displayStatus,
      winningNumber: displayWinningNumber, // 🔥 Use the properly set winning number
      timeline: TIMELINE,
      timestamp: new Date().toISOString()
    };
    
    // Emit timer update
    if (isSocketReady()) {
      emitToAll("timerUpdate", timerData);
      
      // Debug logging for manual winner
      if (currentRound?.isManualWinner && displayWinningNumber !== null) {
        console.log(`🎯 MANUAL WINNER DISPLAYED: ${displayWinningNumber}, TimeLeft: ${timeLeft}s`);
      }
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
   CALCULATE WINNER IMMEDIATELY (at 11s) - UPDATED WITH MANUAL WINNER LOGGING
----------------------------------------------------*/
const calculateWinnerImmediately = async () => {
  try {
    console.log("🎯 Calculating winner @11s (bidding closed)");
    
    phase = "calculating";
    
    const winnerData = await calculateWinner(currentRound._id);
    calculatedWinner = winnerData;
    winnerCalculated = true;

    currentRound.calculatedWinningNumber = winnerData.storedWinningNumber;
    await currentRound.save();
    
    // 🔥 IMPROVED LOGGING
    if (currentRound.isManualWinner && currentRound.manualWinner) {
      const manualWinNum = currentRound.manualWinner === 10 ? 0 : currentRound.manualWinner;
      console.log(`✅ MANUAL WINNER USED: ${manualWinNum} (set by admin)`);
      
      // Emit manual winner confirmation
      if (isSocketReady()) {
        emitToAll("manualWinnerConfirmed", {
          roundNumber: currentRound.roundNumber,
          winningNumber: manualWinNum,
          message: "Manual winner confirmed and will be displayed",
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.log(`✅ AUTOMATIC WINNER CALCULATED: ${winnerData.winningNumber}`);
    }
    
  } catch (error) {
    console.error("❌ Error calculating winner:", error);
  }
};

/* ---------------------------------------------------
   TRIGGER PLAY SPIN PHASE (at 8s) - UPDATED WITH MANUAL WINNER INFO
----------------------------------------------------*/
const triggerPlaySpinPhase = async () => {
  try {
    phase = "playSpin";
    
    if (isSocketReady() && calculatedWinner) {
      const winningNumber = calculatedWinner.storedWinningNumber === 10 ? 0 : calculatedWinner.storedWinningNumber;
      const isManualWinner = currentRound.isManualWinner || false;
      
      // Emit playSpin event with winner number and manual flag
      emitToAll("playSpin", {
        roundNumber: currentRound?.roundNumber || 0,
        phase: "playSpin",
        timeLeft: TIMELINE.SPIN_ANIMATION_TIME, // 5 seconds for spinner
        status: "playSpin",
        winningNumber: winningNumber,
        isManualWinner: isManualWinner, // 🔥 NEW: Indicates if winner was manually set
        message: isManualWinner 
          ? "Manual winner set by admin - Play spin animation" 
          : "Automatic winner - Play spin animation",
        timestamp: new Date().toISOString()
      });
      console.log(`🎰 EMITTED playSpin: Round ${currentRound?.roundNumber}, Winner: ${winningNumber}, Manual: ${isManualWinner}`);
    }
  } catch (error) {
    console.error("❌ Error triggering play spin phase:", error);
  }
};

/* ---------------------------------------------------
   TRIGGER ROUND COMPLETE & HOLD (at 3s) - UPDATED WITH MANUAL WINNER INFO
----------------------------------------------------*/
const triggerRoundCompleteAndHold = async () => {
  try {
    phase = "hold";
    
    // Process rewards and complete round
    if (currentRound && calculatedWinner) {
      await processRoundRewards(calculatedWinner);
      
      currentRound.status = "completed";
      currentRound.winningNumber = calculatedWinner.winningNumber === 0 ? 10 : calculatedWinner.winningNumber;
      currentRound.endTime = new Date();
      currentRound.phase = "completed";
      await currentRound.save();
      
      console.log(`✅ Round ${currentRound.roundNumber} completed. Winner: ${calculatedWinner.winningNumber}`);
    }
    
    // Emit completion events
    if (isSocketReady() && calculatedWinner) {
      const winningNumber = calculatedWinner.storedWinningNumber === 10 ? 0 : calculatedWinner.storedWinningNumber;
      const isManualWinner = currentRound.isManualWinner || false;
      
      emitToAll("roundCompleted", {
        roundNumber: currentRound?.roundNumber || 0,
        winningNumber: winningNumber,
        isManualWinner: isManualWinner, // 🔥 NEW: Manual winner flag
        phase: "completed", 
        status: "completed",
        message: isManualWinner 
          ? "Round completed with manual winner" 
          : "Round completed with automatic winner",
        timestamp: new Date().toISOString()
      });
      
      console.log(`🏁 EMITTED roundCompleted : Winner ${winningNumber}, Manual: ${isManualWinner}`);
    }
    
  } catch (error) {
    console.error("❌ Error triggering round complete:", error);
  }
};

/* ---------------------------------------------------
   PROCESS ROUND REWARDS - UPDATED WITH SOCKET
----------------------------------------------------*/
const processRoundRewards = async (winnerData) => {
  try {
    const { winningNumber, storedWinningNumber, bids, isManual } = winnerData;
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

      // Update user's pending winning coins
      const winnerUser = await User.findByIdAndUpdate(winnerUserId, {
        $inc: { pendingWinningCoins: reward }
      }, { new: true });

      // 🔥 ATTACH MANUAL WINNER INFO TO THE WINNING BID
      await Bid.findByIdAndUpdate(winnerBidId, {
        $set: { 
          result: "win", 
          reward: reward,
          isManualWinner: isManual || false // 🔥 Store if this was a manual win
        }
      });

      // 🔥 REAL-TIME BALANCE UPDATE - User won
      if (isSocketReady() && winnerUser) {
        emitToUser(winnerUserId.toString(), "balanceUpdate", {
          success: true,
          message: isManual 
            ? "Congratulations! You won with manual selection!" 
            : "Congratulations! You won the round!",
          data: {
            coins: winnerUser.coins,
            pendingWinningCoins: winnerUser.pendingWinningCoins,
            totalBalance: winnerUser.coins + winnerUser.pendingWinningCoins,
            rewardAmount: reward,
            roundWinningNumber: winningNumber,
            isManualWinner: isManual, // 🔥 Include manual winner flag
            type: "round_won"
          },
          timestamp: new Date().toISOString()
        });
        console.log(`💰 ${isManual ? 'MANUAL ' : ''}Winner update sent to user: ${winnerUserId}`);
      }

      // 🔥 BROADCAST WINNER INFO TO ALL
      if (isSocketReady()) {
        emitToAll("winnerAnnounced", {
          roundNumber: currentRound?.roundNumber || 0,
          winningNumber: winningNumber,
          winnerUserId: winnerUserId,
          winnerBidId: winnerBidId,
          rewardAmount: reward,
          isManualWinner: isManual, // 🔥 Manual winner flag
          totalParticipants: bids.length,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Mark losers and send them balance updates too
    const losers = bids.filter(b => String(b._id) !== String(winnerBidId)).map(b => b._id);
    if (losers.length) {
      await Bid.updateMany(
        { _id: { $in: losers } },
        { 
          result: "lose", 
          reward: 0,
          isManualWinner: false // 🔥 Losers are not manual winners
        }
      );

      // 🔥 REAL-TIME BALANCE UPDATE - Losers (just current balance)
      for (const bid of bids.filter(b => String(b._id) !== String(winnerBidId))) {
        const loserUser = await User.findById(bid.userId);
        if (loserUser && isSocketReady()) {
          emitToUser(bid.userId.toString(), "balanceUpdate", {
            success: true,
            message: "Round completed - Better luck next time!",
            data: {
              coins: loserUser.coins,
              pendingWinningCoins: loserUser.pendingWinningCoins,
              totalBalance: loserUser.coins + loserUser.pendingWinningCoins,
              roundWinningNumber: winningNumber,
              isManualWinner: false, // 🔥 Losers are not manual winners
              type: "round_lost"
            },
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    console.log(`💰 ${isManual ? 'MANUAL ' : ''}Rewards processed for Round ${currentRound?.roundNumber}`);
    
  } catch (error) {
    console.error("❌ Error processing rewards:", error);
  }
};

/* ---------------------------------------------------
   CALCULATE WINNER - UPDATED WITH MANUAL WINNER SUPPORT
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

    // 🔥 MANUAL WINNER LOGIC: Check if admin set manual winner between 50s-57s
    if (round.isManualWinner && round.manualWinner) {
      winningNumber = round.manualWinner == 10 ? 0 : round.manualWinner;
      console.log(`🎯 USING MANUAL WINNER: ${winningNumber} (set by admin)`);
    } else {
      // 🔥 DEFAULT AUTOMATIC WINNER CALCULATION
      console.log("🎯 USING AUTOMATIC WINNER CALCULATION");
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
      counts,
      isManual: round.isManualWinner || false
    };
  } catch (error) {
    console.error("❌ Error in calculateWinner:", error);
    return {
      winningNumber: 0,
      storedWinningNumber: 10,
      bids: [],
      counts: {},
      isManual: false
    };
  }
};

/* ---------------------------------------------------
   START NEW ROUND (at 0s)
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

    timeLeft = TIMELINE.TOTAL_ROUND_TIME;
    phase = "bidding";
    winnerCalculated = false;
    calculatedWinner = null;

    console.log(`🔄 New Round Started: #${currentRound.roundNumber}, TimeLeft: ${timeLeft}s`);

    // Emit new round event
    emitToAll("newRound", {
      roundNumber: currentRound.roundNumber,
      timeLeft: TIMELINE.TOTAL_ROUND_TIME,
      phase: "bidding",
      status: "running",
      timeline: TIMELINE,
      timestamp: new Date().toISOString()
    });
    console.log(`🔄 EMITTED newRound: #${currentRound.roundNumber}`);

    // Continue ticking
    setTimeout(tick, 1000);

  } catch (error) {
    console.error("❌ Error starting new round:", error);
    setTimeout(startNewRound, 3000);
  }
};

/* ---------------------------------------------------
   GET CURRENT TIMER STATUS
----------------------------------------------------*/
export const getTimerStatus = () => {
  return {
    timerRunning,
    currentRound: currentRound ? {
      roundNumber: currentRound.roundNumber,
      status: currentRound.status,
      phase: currentRound.phase,
      isManualWinner: currentRound.isManualWinner || false,
      manualWinner: currentRound.manualWinner
    } : null,
    timeLeft,
    phase,
    winnerCalculated,
    timeline: TIMELINE
  };
};

export const getTimeline = () => TIMELINE;