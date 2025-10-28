import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";

const router = express.Router();

import rateLimit from "express-rate-limit";

const orgLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", orgLoginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, error: "Email and password are required" });
    }

    // Login using email (username field contains email) - case insensitive
    const result = await pool.query(
      "SELECT * FROM organizations WHERE LOWER(email) = LOWER($1) AND is_active = true",
      [username],
    );

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    const org = result.rows[0];
    const valid = await bcrypt.compare(password, org.password_hash);
    if (!valid) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        organization_id: org.organization_id,
        email: org.email,
        name: org.name,
        type: "organization",
      },
      process.env.JWT_SECRET || "organlink_secret_key_2024",
      { expiresIn: "24h" },
    );

    res.cookie("organization_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    const { password_hash: _, ...orgData } = org;
    res.json({ success: true, token, organization: orgData });
  } catch (err) {
    console.error("Organization login error:", err);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

router.get("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token)
      return res
        .status(401)
        .json({ success: false, error: "No token provided" });

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "organlink_secret_key_2024",
    ) as any;
    const result = await pool.query(
      "SELECT * FROM organizations WHERE organization_id = $1",
      [decoded.organization_id],
    );
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, error: "Organization not found" });

    const { password_hash: _, ...orgData } = result.rows[0];
    res.json({ success: true, organization: orgData });
  } catch (err) {
    console.error("Organization verify error:", err);
    res.status(401).json({ success: false, error: "Invalid token" });
  }
});

// Request password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const { organization_id, email } = req.body;

    if (!organization_id || !email) {
      return res.status(400).json({
        success: false,
        error: "Organization ID and email are required",
      });
    }

    // Verify organization exists and get name
    const orgResult = await pool.query(
      "SELECT organization_id, name, email FROM organizations WHERE organization_id = $1 AND email = $2 AND is_active = true",
      [organization_id, email],
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Organization not found with provided ID and email",
      });
    }

    const organization = orgResult.rows[0];

    // Create password reset request (request_id is auto-increment)
    const requestResult = await pool.query(
      `INSERT INTO password_reset_requests (organization_id, requester_email, reason) 
       VALUES ($1, $2, $3)
       RETURNING request_id`,
      [organization_id, email, `Password reset requested by organization ${organization.name}`],
    );

    const request_id = requestResult.rows[0].request_id;

    // Create notification for admin
    const notification_id = `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(
      `INSERT INTO notifications (notification_id, hospital_id, type, title, message, related_id) 
       VALUES ($1, 'ADMIN', 'password_reset_request', $2, $3, $4)`,
      [
        notification_id,
        'Password Reset Request',
        `Organization "${organization.name}" (ID: ${organization_id}) has requested a password reset.`,
        request_id.toString(),
      ],
    );

    res.json({
      success: true,
      message: "Password reset request sent to admin. You will be notified once approved.",
      request_id,
    });
  } catch (error) {
    console.error("Password reset request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process password reset request",
    });
  }
});

// Logout: clear cookie
router.post("/logout", async (_req, res) => {
  res.clearCookie("organization_token");
  res.json({ success: true });
});

export default router;
