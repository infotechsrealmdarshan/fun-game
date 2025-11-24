// controllers/timerController.js
import Round from "../models/Round.js";
import Bid from "../models/Bid.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";

let currentRound = null;
let phase = "bidding";
let timeLeft = 60;
let timerRunning = false;
let ioInstance = null;
let winnerCalculated = false;
let calculatedWinner = null;

/* ---------------------------------------------------
   SOCKET SETTER
----------------------------------------------------*/
export const setSocketInstance = (io) => {
  ioInstance = io;
};

/* ---------------------------------------------------
   GLOBAL TICK (ACCESSIBLE IN finalizeRound)
----------------------------------------------------*/
let tick = null;

/* ---------------------------------------------------
   START GAME TIMER
----------------------------------------------------*/
export const startGameTimer = async (io) => {

  if (timerRunning) return;
  timerRunning = true;
  if (io) ioInstance = io;

  console.log("🎮 Game Timer Starting...");

  currentRound = await Round.findOne().sort({ roundNumber: -1 });

  if (!currentRound) {
    currentRound = await Round.create({
      roundNumber: 1,
      roundId: "ROUND_1",
      phase: "bidding",
      status: "running",
      startTime: new Date()
    });
  } else if (currentRound.status === "completed") {
    const next = currentRound.roundNumber + 1;
    currentRound = await Round.create({
      roundNumber: next,
      roundId: `ROUND_${next}`,
      phase: "bidding",
      status: "running",
      startTime: new Date()
    });
  } else {
    phase = currentRound.phase || "bidding";
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

  /* ---------------------------------------------------
     DEFINE GLOBAL TICK
  ----------------------------------------------------*/
  tick = async () => {
    try {
      // Phase update
      let displayPhase = phase;
      if (timeLeft <= 15 && timeLeft > 0 && phase === "bidding") {
        displayPhase = "hold";
      }

      // Send timer update
      // Send timer update
      if (ioInstance) {
        ioInstance.emit("timerUpdate", {
          roundNumber: currentRound.roundNumber,
          phase: displayPhase,
          timeLeft,
          status: "running",
          winningNumber:
            phase === "hold" && calculatedWinner
              ? (calculatedWinner.storedWinningNumber === 10
                ? 0
                : calculatedWinner.storedWinningNumber)
              : null
        });
      }

      // Enter hold phase
      if (timeLeft === 15 && phase !== "hold") {
        phase = "hold";
        currentRound.phase = "hold";
        await currentRound.save();
        ioInstance?.emit("phaseChange", {
          roundNumber: currentRound.roundNumber,
          phase: "hold"
        });
        winnerCalculated = false;
        calculatedWinner = null;
      }

      // 🧮 EARLY FIX: calculate winner at EXACT 57s
      if (phase === "hold" && timeLeft === 5 && !winnerCalculated) {
        console.log("🎯 WINNER DECIDED @5s");

        const winnerData = await calculateWinner(currentRound._id);
        calculatedWinner = winnerData;
        winnerCalculated = true;

        currentRound.calculatedWinningNumber = winnerData.storedWinningNumber;
        await currentRound.save();
      }

      // 🎯 PREVIEW AT 3,2,1
      if (phase === "hold" && timeLeft <= 5 && timeLeft >= 1) {

        let preview =
          currentRound.calculatedWinningNumber === 10
            ? 0
            : currentRound.calculatedWinningNumber;

        console.log(`🎯 PREVIEW ${timeLeft}s → Winner: ${preview}`);

        ioInstance?.emit("winnerPreview", {
          roundNumber: currentRound.roundNumber,
          winningNumber: preview,
          phase: "hold",
          timeLeft
        });
      }

      // Finalize round
      if (timeLeft <= 0) {
        console.log(`⏳ Finalizing Round #${currentRound.roundNumber}`);

        let winnerData = calculatedWinner;
        if (!winnerCalculated) {
          winnerData = await calculateWinner(currentRound._id);
        }
        await finalizeRound(winnerData);

        return; // stop tick here
      }

      // Continue tick
      timeLeft -= 1;
      setTimeout(tick, 1000);

    } catch (err) {
      console.error("🔥 Tick error:", err);
      timeLeft = Math.max(0, timeLeft - 1);
      setTimeout(tick, 1000);
    }
  };

  setTimeout(tick, 1000);
};

/* ---------------------------------------------------
   CALCULATE WINNER
----------------------------------------------------*/
const calculateWinner = async (roundId) => {
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

    currentRound.status = "completed";
    currentRound.winningNumber = winningNumber;
    currentRound.endTime = new Date();
    await currentRound.save();

    ioInstance?.emit("roundResult", {
      roundNumber: currentRound.roundNumber,
      winningNumber,
      winnerUserId,
      reward,
      isFinal: true
    });

    console.log(`🏁 Round #${currentRound.roundNumber} completed.`);

    // SHORT BREAK
    await new Promise((r) => setTimeout(r, 4000));

    const next = currentRound.roundNumber + 1;
    currentRound = await Round.create({
      roundNumber: next,
      roundId: `ROUND_${next}`,
      phase: "bidding",
      status: "running",
      startTime: new Date()
    });

    timeLeft = 60;
    phase = "bidding";
    winnerCalculated = false;
    calculatedWinner = null;

    ioInstance?.emit("newRound", {
      roundNumber: currentRound.roundNumber,
      timeLeft: 60,
      phase: "bidding",
      status: "running"
    });

    setTimeout(tick, 1000);

  } catch (err) {
    console.error("❌ finalizeRound Error:", err);
    setTimeout(tick, 1000);
  }
};
