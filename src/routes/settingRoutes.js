import express from "express";
import { 
  getSettings, 
  updateSettings, 
  setManualWinner, 
  getReturnMultiplier 
} from "../controllers/settingsController.js";
import { adminAuth } from "../middlewares/adminAuth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: Application settings management APIs
 */

/**
 * @swagger
 * /api/settings:
 *   get:
 *     tags: [Settings]
 *     summary: Get current settings
 *     description: Retrieve the current application settings including return multiplier and manual winner settings
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Settings retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     globalReturnMultiplier:
 *                       type: number
 *                       example: 10
 *                     manualWinnerEnabled:
 *                       type: boolean
 *                       example: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       500:
 *         description: Internal server error
 */
router.get("/", getSettings);

/**
 * @swagger
 * /api/settings/multiplier:
 *   get:
 *     tags: [Settings]
 *     summary: Get return multiplier
 *     description: Retrieve only the global return multiplier value
 *     responses:
 *       200:
 *         description: Return multiplier retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Return multiplier retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     globalReturnMultiplier:
 *                       type: number
 *                       example: 10
 *       500:
 *         description: Internal server error
 */
router.get("/multiplier", getReturnMultiplier);

/**
 * @swagger
 * /api/settings:
 *   put:
 *     tags: [Settings]
 *     summary: Update settings (Admin only)
 *     description: Update application settings including global return multiplier and manual winner enablement
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               globalReturnMultiplier:
 *                 type: number
 *                 description: Global return multiplier for all winning numbers
 *                 example: 15
 *               manualWinnerEnabled:
 *                 type: boolean
 *                 description: Enable/disable manual winner selection
 *                 example: true
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       401:
 *         description: Unauthorized - Admin access required
 *       500:
 *         description: Internal server error
 */
router.put("/", adminAuth, updateSettings);

/**
 * @swagger
 * /api/settings/manual-winner:
 *   post:
 *     tags: [Settings]
 *     summary: Set manual winner (Admin only)
 *     description: Set a manual winning number during hold phase. This overrides automatic winner calculation.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - winningNumber
 *             properties:
 *               winningNumber:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 9
 *                 description: Winning number to set manually (0-9)
 *                 example: 5
 *     responses:
 *       200:
 *         description: Manual winner set successfully
 *       400:
 *         description: Bad request - Invalid input or not in hold phase
 *       401:
 *         description: Unauthorized - Admin access required
 *       500:
 *         description: Internal server error
 */
router.post("/manual-winner", adminAuth, setManualWinner);

export default router;