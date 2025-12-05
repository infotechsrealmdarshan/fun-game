import Round from "../models/Round.js";

export const getLastTenWinnersForSocket = async () => {
  try {
    // Get last 10 completed rounds with winners
    const lastTenRounds = await Round.find({
      status: "completed",
      winningNumber: { $ne: null }
    })
      .sort({ roundNumber: -1 })
      .limit(10);

    // Process winners array - just numbers
    const lastTenWinners = lastTenRounds.map(round => {
      const winningNumber = round.winningNumber === 10 ? 0 : round.winningNumber;
      return winningNumber; // Just the number
    });


    return {
      lastTenWinners: lastTenWinners,
      fetchedAt: new Date().toISOString(),
      count: lastTenWinners.length
    };
  } catch (error) {
    console.error("❌ Error fetching last 10 winners:", error);
    return {
      lastTenWinners: [], // Empty array on error
      fetchedAt: new Date().toISOString(),
      count: 0
    };
  }
};