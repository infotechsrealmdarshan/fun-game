// controllers/timerController.js
import Round from "../models/Round.js";
import Bid from "../models/Bid.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import { emitToAll, emitToUser, isSocketReady } from "../config/socketConfig.js";
import { getLastTenWinnersForSocket } from "../utils/winnerHelper.js";

// ============================================================
// STATE VARIABLES
// ============================================================
let currentRound = null;
let timerRunning = false;
let visibleInterval = null;
let hiddenTimeout = null;
let hiddenInterval = null;
let visibleTimeLeft = 60; // 60 seconds visible to users
let hiddenTimeLeft = 8;   // 8 seconds hidden internal cycle
let winnerCalculated = false;
let calculatedWinner = null;
let lastEmittedVisible = null; // guard to prevent duplicate emits for same timeLeft
let visibleTickRunning = false; // prevent overlapping visible interval callbacks
let hiddenTickRunning = false;  // prevent overlapping hidden interval callbacks

// ============================================================
// TIMELINE CONFIG
// ============================================================
const TIMELINE = {
  VISIBLE_TIME: 60,          // 60 seconds shown to users (bidding phase)
  HIDDEN_TIME: 8,            // 8 seconds internal (after visible time ends)
  TOTAL_CYCLE: 68,           // Total: 60 + 8 = 68 seconds
  MANUAL_WINNER_WINDOW_START: 10,  // Manual winner window opens at 10s
  MANUAL_WINNER_WINDOW_END: 3,     // Manual winner window closes at 3s (admin allowed until 3s)
  MANUAL_PHASE_CHANGE_AT: 3,       // Emit phaseChange at visible 3s
  VISIBLE_CALCULATE_WINNER_AT: 2,  // Calculate winner at visible 2s so winner ready by 0s
  VISIBLE_PLAY_SPIN: 0,            // Play spin at visible 0s (end of bidding)
  HIDDEN_ROUND_COMPLETE: 3,    // Hidden cycle: 3s -> process rewards + roundCompleted
  HIDDEN_NEW_ROUND: 0           // Start new round at hidden 0s
};

/* ---------------------------------------------------
   START GAME TIMER
----------------------------------------------------*/
export const startGameTimer = async () => {
  if (timerRunning) {
    console.log("⚠️ Timer already running");
    return;
  }

  timerRunning = true;
  winnerCalculated = false;
  calculatedWinner = null;

  console.log("🎮 Starting Round Timer - 60s VISIBLE + 8s HIDDEN");
  console.log("📊 Timeline: 60s Visible → 8s Hidden (Calc→Spin→Complete→NewRound)");

  try {
    // Get or create current round
    const lastRound = await Round.findOne().sort({ roundNumber: -1 });

    if (!lastRound || lastRound.status === "completed") {
      const nextRoundNum = lastRound ? lastRound.roundNumber + 1 : 1;
      currentRound = await Round.create({
        roundNumber: nextRoundNum,
        roundId: `ROUND_${nextRoundNum}`,
        phase: "bidding",
        status: "running",
        startTime: new Date()
      });
      console.log(`✅ Created new round: ${currentRound.roundNumber}`);
    } else {
      currentRound = lastRound;
      console.log(`✅ Resumed existing round: ${currentRound.roundNumber}`);
    }

    // Reset timers
    // Start visible countdown from TIMELINE.VISIBLE_TIME - 1 so the first
    // emitted second is e.g. 59 (for a 60s visible window) and the UI
    // receives one-second gaps: 59 .. 0
    visibleTimeLeft = TIMELINE.VISIBLE_TIME - 1;
    hiddenTimeLeft = TIMELINE.HIDDEN_TIME;

    // Start the visible 60-second cycle
    startVisibleCycle();

  } catch (err) {
    console.error("❌ Error starting round timer:", err);
    timerRunning = false;
  }
};

/* ============================================================
   VISIBLE CYCLE: 60 seconds (what users see)
============================================================*/
const startVisibleCycle = () => {
  // Clear any existing visible interval to avoid duplicate intervals
  if (visibleInterval) {
    clearInterval(visibleInterval);
  }

  // Reset last emitted guard so the new cycle starts clean
  lastEmittedVisible = null;

  console.log(`⏱️ VISIBLE CYCLE START: counting ${TIMELINE.VISIBLE_TIME - 1} → 0 (${TIMELINE.VISIBLE_TIME} ticks)`);

  visibleInterval = setInterval(async () => {
    if (visibleTickRunning) return; // skip this tick if the previous is still running
    visibleTickRunning = true;
    try {
      // ✅ FIXED: Determine current phase dynamically
      let currentPhase = "bidding";
      let biddingLocked = false;

      if (visibleTimeLeft <= TIMELINE.MANUAL_PHASE_CHANGE_AT) {
        currentPhase = "hold";
        biddingLocked = true;
      }

      // Update round in database with current phase and lock status
      if (currentRound && currentRound._id) {
        try {
          // Update only if phase has changed
          if (currentRound.phase !== currentPhase || currentRound.biddingLocked !== biddingLocked) {
            currentRound.phase = currentPhase;
            currentRound.biddingLocked = biddingLocked;
            await currentRound.save();
            console.log(`📝 Updated round ${currentRound.roundNumber}: phase=${currentPhase}, biddingLocked=${biddingLocked}`);
          }
        } catch (err) {
          console.error("❌ Error saving round update:", err);
        }
      }

      // Emit timerUpdate ONLY during visible time
      if (isSocketReady()) {
        // Prevent emitting the same `timeLeft` more than once (duplicates seen as 3,2,2,0)
        if (lastEmittedVisible !== visibleTimeLeft) {
          emitToAll("timerUpdate", {
            roundNumber: currentRound?.roundNumber || 0,
            phase: currentPhase,  // ✅ Use dynamic phase
            timeLeft: visibleTimeLeft,
            status: "running",
            totalCycle: TIMELINE.TOTAL_CYCLE,
            visibleTime: TIMELINE.VISIBLE_TIME,
            timestamp: new Date().toISOString()
          });
          lastEmittedVisible = visibleTimeLeft;
        } else {
          // Skip duplicate emit for same timeLeft
        }
      }

      // Manual winner window: 10s to 3s (emit once at window start)
      if (visibleTimeLeft === TIMELINE.MANUAL_WINNER_WINDOW_START) {
        if (isSocketReady()) {
          const duration = TIMELINE.MANUAL_WINNER_WINDOW_START - TIMELINE.MANUAL_WINNER_WINDOW_END + 1;
          emitToAll("manualWinnerWindow", {
            roundNumber: currentRound?.roundNumber || 0,
            message: `Manual winner window open (${TIMELINE.MANUAL_WINNER_WINDOW_START}s - ${TIMELINE.MANUAL_WINNER_WINDOW_END}s) - Admin can set winner`,
            windowOpen: true,
            timeLeft: visibleTimeLeft,
            duration,
            timestamp: new Date().toISOString()
          });
          console.log(`🔧 Manual Winner Window OPEN at ${TIMELINE.MANUAL_WINNER_WINDOW_START}s for ${duration}s`);
        }
      }

      // At visible 3s (57s elapsed): additionally emit phaseChange event
      if (visibleTimeLeft === TIMELINE.MANUAL_PHASE_CHANGE_AT) {
        try {
          console.log(`🔄 Phase transition: bidding → hold (Round ${currentRound?.roundNumber})`);

          if (isSocketReady()) {
            // 🔥 Include winningNumber in phaseChange if already calculated
            const phaseChangeData = {
              roundNumber: currentRound?.roundNumber || 0,
              phase: "hold",
              previousPhase: "bidding",
              message: "Pausing bidding - moving to hold (57s elapsed)",
              timestamp: new Date().toISOString()
            };

            // If winner is already calculated, include it in the event
            if (winnerCalculated && calculatedWinner) {
              const winningNumber = calculatedWinner.storedWinningNumber === 10 ? 0 : calculatedWinner.storedWinningNumber;
              phaseChangeData.winningNumber = winningNumber;
              phaseChangeData.isManualWinner = currentRound.isManualWinner || false;
              console.log(`📍 Included winner in phaseChange: ${winningNumber}`);
            }

            emitToAll("phaseChange", phaseChangeData);
          }

          console.log(`🔒 Bidding locked for Round ${currentRound.roundNumber}`);
        } catch (err) {
          console.error("❌ Error setting phaseChange at 57s:", err);
        }
      }

      // At visible 2s: calculate winner so result is ready before 0s
      if (visibleTimeLeft === TIMELINE.VISIBLE_CALCULATE_WINNER_AT) {
        try {
          console.log(`🎯 Visible 2s → Pre-calculating winner`);
          if (!winnerCalculated) {
            await calculateWinnerImmediately();
          }
        } catch (err) {
          console.error("❌ Error pre-calculating winner at visible 2s:", err);
        }
      }

      // At visible 0s: Emit playSpin using pre-calculated winner (or calculate if missing)
      if (visibleTimeLeft === TIMELINE.VISIBLE_PLAY_SPIN) {
        console.log(`🎰 Visible 0s → Emitting playSpin with prepared winner`);
        if (!winnerCalculated) {
          await calculateWinnerImmediately();
        }
        await triggerPlaySpinWithWinner();
      }

      visibleTimeLeft--;

      // When visible time reaches 0, transition to hidden cycle
      if (visibleTimeLeft < 0) {
        clearInterval(visibleInterval);
        console.log(`✅ VISIBLE CYCLE COMPLETE - Starting HIDDEN CYCLE`);
        startHiddenCycle();
      }
    } catch (err) {
      console.error("❌ Error in visible cycle:", err);
    } finally {
      visibleTickRunning = false;
    }
  }, 1000);
};

/* ============================================================
   HIDDEN CYCLE: 8 seconds (NO timerUpdate, only internal events)
============================================================*/
const startHiddenCycle = () => {
  console.log(`🔒 HIDDEN CYCLE START: 8s internal countdown`);

  hiddenTimeLeft = TIMELINE.HIDDEN_TIME;

  hiddenInterval = setInterval(async () => {
    if (hiddenTickRunning) return; // skip if previous hidden tick still running
    hiddenTickRunning = true;
    try {
      // At hiddenLeft = 3: Process rewards and complete round (do not re-emit playSpin)
      if (hiddenTimeLeft === TIMELINE.HIDDEN_ROUND_COMPLETE) {
        console.log(`🎯 Hidden ${TIMELINE.HIDDEN_ROUND_COMPLETE}s → Processing rewards & Completing round`);

        if (!winnerCalculated) {
          await calculateWinnerImmediately();
        }

        // Process rewards (uses calculatedWinner)
        if (calculatedWinner) {
          await processRoundRewards(calculatedWinner);
        }

        // Complete round
        await triggerRoundCompleted();
      }

      hiddenTimeLeft--;

      // At hiddenLeft = 0: Start new round
      if (hiddenTimeLeft < 0) {
        clearInterval(hiddenInterval);
        console.log(`✅ HIDDEN CYCLE COMPLETE → Starting NEW ROUND`);
        await startNewRound();
      }
    } catch (err) {
      console.error("❌ Error in hidden cycle:", err);
    } finally {
      hiddenTickRunning = false;
    }
  }, 1000);
};

/* ============================================================
   CALCULATE WINNER IMMEDIATELY (hidden 8s mark)
============================================================*/
const calculateWinnerImmediately = async () => {
  try {
    if (winnerCalculated) {
      console.log("⚠️ Winner already calculated");
      return;
    }

    const winnerData = await calculateWinner(currentRound._id);
    calculatedWinner = winnerData;
    winnerCalculated = true;

    currentRound.calculatedWinningNumber = winnerData.storedWinningNumber;
    await currentRound.save();

    // Log result
    if (currentRound.isManualWinner && currentRound.manualWinner) {
      const manualWinNum = currentRound.manualWinner === 10 ? 0 : currentRound.manualWinner;
      console.log(`✅ MANUAL WINNER: ${manualWinNum} (set by admin)`);

      if (isSocketReady()) {
        emitToAll("manualWinnerConfirmed", {
          roundNumber: currentRound.roundNumber,
          winningNumber: manualWinNum,
          message: "Manual winner confirmed",
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.log(`✅ AUTOMATIC WINNER: ${winnerData.winningNumber}`);
    }
  } catch (error) {
    console.error("❌ Error calculating winner:", error);
  }
};

/* ============================================================
   TRIGGER PLAY SPIN (hidden 5s mark)
============================================================*/
const triggerPlaySpin = async () => {
  try {
    if (!calculatedWinner) {
      console.log("⚠️ No winner calculated yet");
      return;
    }

    if (isSocketReady()) {
      const winningNumber = calculatedWinner.storedWinningNumber === 10 ? 0 : calculatedWinner.storedWinningNumber;
      const isManualWinner = currentRound.isManualWinner || false;

      emitToAll("playSpin", {
        roundNumber: currentRound?.roundNumber || 0,
        phase: "playSpin",
        status: "playSpin",
        winningNumber: winningNumber,
        isManualWinner: isManualWinner,
        message: isManualWinner
          ? "Manual winner - Play spin animation"
          : "Automatic winner - Play spin animation",
        timestamp: new Date().toISOString()
      });
      console.log(`🎰 EMITTED playSpin: Winner ${winningNumber}`);
    }
  } catch (error) {
    console.error("❌ Error triggering play spin:", error);
  }
};

/* ============================================================
   TRIGGER PLAY SPIN WITH WINNER (hidden 3s mark)
   Emits playSpin event with winner information attached
============================================================*/
const triggerPlaySpinWithWinner = async () => {
  try {
    if (!calculatedWinner) {
      console.log("⚠️ No winner calculated yet");
      return;
    }

    if (isSocketReady()) {
      const winningNumber = calculatedWinner.storedWinningNumber === 10 ? 0 : calculatedWinner.storedWinningNumber;
      const isManualWinner = currentRound.isManualWinner || false;

      emitToAll("playSpin", {
        roundNumber: currentRound?.roundNumber || 0,
        phase: "playSpin",
        status: "playSpin",
        winningNumber: winningNumber,
        isManualWinner: isManualWinner,
        winnerInfo: {
          winningNumber: winningNumber,
          winnerCount: calculatedWinner.bids.filter(b => {
            const v = b.bidNumber == 10 ? 0 : Number(b.bidNumber);
            return v === winningNumber;
          }).length,
          totalBids: calculatedWinner.bids.length,
          isManualWinner: isManualWinner
        },
        message: isManualWinner
          ? "Manual winner set - Play spin animation with winner"
          : "Winner calculated - Play spin animation with winner",
        timestamp: new Date().toISOString()
      });
      console.log(`🎰 EMITTED playSpin WITH WINNER: ${winningNumber} (Hidden 3s)`);
    }
  } catch (error) {
    console.error("❌ Error triggering play spin with winner:", error);
  }
};

/* ============================================================
   TRIGGER ROUND COMPLETED (hidden 3s mark)
============================================================*/
const triggerRoundCompleted = async () => {
  try {
    if (!currentRound || !calculatedWinner) {
      console.log("⚠️ Cannot complete round - missing data");
      return;
    }

    currentRound.status = "completed";
    currentRound.winningNumber = calculatedWinner.winningNumber === 0 ? 10 : calculatedWinner.winningNumber;
    currentRound.endTime = new Date();
    currentRound.phase = "completed";
    await currentRound.save();

    if (isSocketReady()) {
      const winningNumber = calculatedWinner.storedWinningNumber === 10 ? 0 : calculatedWinner.storedWinningNumber;
      const isManualWinner = currentRound.isManualWinner || false;

      emitToAll("roundCompleted", {
        roundNumber: currentRound?.roundNumber || 0,
        winningNumber: winningNumber,
        isManualWinner: isManualWinner,
        phase: "completed",
        status: "completed",
        message: isManualWinner
          ? "Round completed with manual winner"
          : "Round completed with automatic winner",
        timestamp: new Date().toISOString()
      });
      console.log(`🏁 EMITTED roundCompleted: Winner ${winningNumber}`);
    }
  } catch (error) {
    console.error("❌ Error in round completed:", error);
  }
};

/* ============================================================
   START NEW ROUND (hidden 0s mark)
============================================================*/
// In timerController.js - startNewRound function
const startNewRound = async () => {
  try {
    // Stop all current timers
    if (visibleInterval) clearInterval(visibleInterval);
    if (hiddenInterval) clearInterval(hiddenInterval);
    if (hiddenTimeout) clearTimeout(hiddenTimeout);

    const nextRoundNumber = currentRound ? currentRound.roundNumber + 1 : 1;

    // Create new round with bidding enabled
    currentRound = await Round.create({
      roundNumber: nextRoundNumber,
      roundId: `ROUND_${nextRoundNumber}`,
      phase: "bidding",
      status: "running",
      biddingLocked: false, // ✅ Ensure bidding is NOT locked for new round
      isManualWinner: false, // ✅ Reset manual winner flag
      manualWinner: null, // ✅ Clear manual winner
      startTime: new Date()
    });

    // Start visible countdown from TIMELINE.VISIBLE_TIME - 1 so UI shows 59..0
    visibleTimeLeft = TIMELINE.VISIBLE_TIME - 1;
    hiddenTimeLeft = TIMELINE.HIDDEN_TIME;
    winnerCalculated = false;
    calculatedWinner = null;

    console.log(`🔄 NEW ROUND STARTED: #${currentRound.roundNumber}, phase=bidding, biddingLocked=false`);

    if (isSocketReady()) {
      // Get last 10 winners for new round event
      const winnersData = await getLastTenWinnersForSocket();
      
      emitToAll("newRound", {
        roundNumber: currentRound.roundNumber,
        phase: "bidding",
        status: "running",
        timeLeft: visibleTimeLeft,
        lastTenWinners: winnersData.lastTenWinners,
        lastTenWinnersString: winnersData.lastTenWinnersString,
        timestamp: new Date().toISOString()
      });
      console.log(`📡 EMITTED newRound: #${currentRound.roundNumber} with last 10 winners`);
    }

    // Restart the visible cycle
    startVisibleCycle();
  } catch (error) {
    console.error("❌ Error starting new round:", error);
    setTimeout(() => startNewRound(), 3000);
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


/* ============================================================
   GET CURRENT TIMER STATUS
============================================================*/
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
    visibleTimeLeft,
    hiddenTimeLeft,
    winnerCalculated,
    timeline: TIMELINE
  };
};

export const getTimeline = () => TIMELINE;

/* ============================================================
   GET CURRENT ELAPSED TIME (during visible cycle)
   Returns elapsed seconds from timer state (not from DB)
============================================================*/
export const getCurrentElapsedTime = () => {
  // During visible cycle: visibleTimeLeft starts at VISIBLE_TIME - 1 (e.g. 59)
  // so elapsed should be calculated against that start value.
  const elapsedDuringVisible = (TIMELINE.VISIBLE_TIME - 1) - visibleTimeLeft;
  return {
    elapsedSeconds: elapsedDuringVisible,
    visibleTimeLeft: visibleTimeLeft,
    inHiddenCycle: visibleTimeLeft < 0,
    hiddenTimeLeft: visibleTimeLeft < 0 ? hiddenTimeLeft : null
  };
};

/* ============================================================
   STOP TIMER (cleanup)
============================================================*/
export const stopTimer = () => {
  if (visibleInterval) clearInterval(visibleInterval);
  if (hiddenInterval) clearInterval(hiddenInterval);
  if (hiddenTimeout) clearTimeout(hiddenTimeout);
  timerRunning = false;
  console.log("⛔ Timer stopped");
};

/* ============================================================
   RESTART TIMER
============================================================*/
export const restartTimer = async () => {
  stopTimer();
  await startRoundTimer();
};