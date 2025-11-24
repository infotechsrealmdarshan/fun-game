// routes/bid.js
import express from "express";
import { placeBid } from "../controllers/bidController.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Bid
 *   description: User bidding related APIs
 */

/**
 * @swagger
 * /api/bid:
 *   post:
 *     tags: [Bid]
 *     summary: Place or update a user bid
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bidNumber
 *               - amount
 *             properties:
 *               bidNumber:
 *                 type: integer
 *                 example: 0
 *               amount:
 *                 type: number
 *                 example: 50
 *     responses:
 *       200:
 *         description: Bid placed or updated successfully
 *       401:
 *         description: Unauthorized - Token missing or invalid
 */
router.post("/", auth, placeBid);

export default router;
