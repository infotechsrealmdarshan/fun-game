import express from "express";
import auth from "../middlewares/auth.js";
import {
  registerUser,
  loginUser,
  getProfile,
  getAllUsers,
  getUserById,
  deleteUserById,
  refreshAccessToken,
  claimWinnings,
  getWinningBalance,
} from "../controllers/userController.js";
import { adminAuth } from "../middlewares/adminAuth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management operations
 */

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - acnumber
 *               - email
 *               - password
 *               - mobile
 *             properties:
 *               acnumber:
 *                 type: string
 *                 example: "123dabc"
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 example: "Password123@"
 *               mobile:
 *                 type: string
 *                 example: "9876543210"
 *     responses:
 *       201:
 *         description: User registered successfully
 */
router.post("/register", registerUser);


/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - acnumber
 *               - password
 *             properties:
 *               acnumber:
 *                 type: string
 *                 example: "123dabc"
 *               password:
 *                 type: string
 *                 example: "Password123@"
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", loginUser);

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get logged-in user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 */
router.get("/profile", auth, getProfile);

/**
 * @swagger
 * /api/users/admin/all:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All users fetched successfully
 */
router.get("/admin/all", adminAuth, getAllUsers);

/**
 * @swagger
 * /api/users/admin/{id}:
 *   get:
 *     summary: Get user by ID (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details fetched successfully
 */
router.get("/admin/:id", adminAuth, getUserById);

/**
 * @swagger
 * /api/users/admin/{id}:
 *   delete:
 *     summary: Delete user by ID (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted successfully
 */
router.delete("/admin/:id", adminAuth, deleteUserById);

/**
 * @swagger
 * /api/users/refresh:
 *   post:
 *     summary: Refresh access token using refresh token
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: New access token generated successfully
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post("/refresh", refreshAccessToken);

/**
 * @swagger
 * /api/users/claim-winnings:
 *   post:
 *     summary: Claim all pending winning coins and add them to user's main coin balance
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Winnings claimed successfully
 *       400:
 *         description: No pending winnings to claim
 *       500:
 *         description: Internal server error
 */
router.post("/claim-winnings", auth, claimWinnings);

/**
 * @swagger
 * /api/users/winning-balance:
 *   get:
 *     summary: Get user's winning balance and coin information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Winning balance retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get("/winning-balance", auth, getWinningBalance);


export default router;
