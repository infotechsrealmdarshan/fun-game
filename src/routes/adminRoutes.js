import express from "express";
import {
  adminLogin,
  createAdmin,
  updateAdmin,
  getAdminProfile,
  forgotPassword,
  resetPassword,
} from "../controllers/adminController.js";
import { adminAuth } from "../middlewares/adminAuth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management APIs
 */

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     tags: [Admin]
 *     summary: Admin login
 *     description: Log in an admin using email and password.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 example: Admin@123
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials or missing fields
 */
router.post("/login", adminLogin);

/**
 * @swagger
 * /api/admin/create:
 *   post:
 *     tags: [Admin]
 *     summary: Create a new admin
 *     description: Register a new admin account.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 example: Admin@123
 *               profileImg:
 *                 type: string
 *                 example: "https://example.com/image.jpg"
 *     responses:
 *       201:
 *         description: Admin created successfully
 *       400:
 *         description: Admin already exists
 */
router.post("/create", createAdmin);

/**
 * @swagger
 * /api/admin/profile:
 *   get:
 *     tags: [Admin]
 *     summary: Get admin profile
 *     security:
 *       - bearerAuth: []
 *     description: Fetch the profile of the logged-in admin.
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/profile", adminAuth, getAdminProfile);

/**
 * @swagger
 * /api/admin/update:
 *   put:
 *     tags: [Admin]
 *     summary: Update admin profile
 *     security:
 *       - bearerAuth: []
 *     description: Update admin details (first name, last name, email, password, profile image).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Jane
 *               lastName:
 *                 type: string
 *                 example: Smith
 *               email:
 *                 type: string
 *                 example: jane@example.com
 *               profileImg:
 *                 type: string
 *                 example: "https://example.com/newimage.jpg"
 *     responses:
 *       200:
 *         description: Admin updated successfully
 *       401:
 *         description: Unauthorized
 */
router.put("/update", adminAuth, updateAdmin);

/**
 * @swagger
 * /api/admin/forgot-password:
 *   post:
 *     tags: [Admin]
 *     summary: Send forgot password email
 *     description: Sends a password reset link to the admin's registered email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@example.com
 *     responses:
 *       200:
 *         description: Password reset email sent successfully
 *       400:
 *         description: Invalid or missing email
 */
router.post("/forgot-password", forgotPassword);

/**
 * @swagger
 * /api/admin/reset-password:
 *   post:
 *     tags: [Admin]
 *     summary: Reset admin password
 *     description: Resets the admin password using the authenticated JWT token.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 description: New password for the admin.
 *                 example: "NewPassword@123"
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 *       401:
 *         description: Unauthorized (missing or invalid JWT)
 */
router.post("/reset-password", adminAuth, resetPassword);



export default router;
