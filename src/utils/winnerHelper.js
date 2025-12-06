import Round from "../models/Round.js";

export const getLastTenWinnersForSocket = async () => {
  try {
    // Fetch last 10 completed rounds (latest first)
    const lastTenRounds = await Round.find({
      status: "completed",
      winningNumber: { $ne: null }
    })
      .sort({ roundNumber: -1 }) // latest → oldest
      .limit(10)
      .lean();

    // Reverse so that order becomes: oldest → newest
    const orderedRounds = lastTenRounds.reverse();

    // Map winners & convert 10 → 0
    const lastTenWinners = orderedRounds.map(r =>
      r.winningNumber === 10 ? 0 : r.winningNumber
    );

    // Fetch the latest round to get the current phase
    const latestRound = await Round.findOne().sort({ roundNumber: -1 }).select("phase").lean();
    const currentPhase = latestRound ? latestRound.phase : null;

    return {
      lastTenWinners,
      fetchedAt: new Date().toISOString(),
      count: lastTenWinners.length,
      currentPhase
    };
  } catch (error) {
    console.error("❌ Error fetching last 10 winners:", error);
    return {
      lastTenWinners: [],
      fetchedAt: new Date().toISOString(),
      count: 0,
      currentPhase: null
    };
  }
};
