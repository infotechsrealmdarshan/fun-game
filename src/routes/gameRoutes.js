import express from "express";
import { getCurrentRoundStatus, getGameTimerStatus } from "../controllers/gameController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Game
 *   description: Game timer & round management
 */

/**
 * @swagger
 * /api/game/timer:
 *   get:
 *     tags: [Game]
 *     summary: Get game timer and status
 *     description: Returns current round number, phase, time left in seconds, and status
 *     responses:
 *       200:
 *         description: Game timer status retrieved successfully
 */
router.get("/timer", getGameTimerStatus);

/**
 * @swagger
 * /api/game/status:
 *   get:
 *     tags: [Game]
 *     summary: Get round status
 *     description:
 *       Returns:
 *       - round number  
 *       - phase (bidding/hold/result)  
 *       - time left  
 *       - winning number (if completed)
 *     responses:
 *       200:
 *         description: Round status data
 */

router.get("/status", getCurrentRoundStatus);

export default router;
