import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";

const router = express.Router();

// Get all countries, states, cities, and hospitals for location-based login
router.get("/locations", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT
        country,
        state,
        city,
        hospital_id,
        name as hospital_name
      FROM hospitals
      WHERE is_active = true
        AND country IS NOT NULL AND trim(country) <> ''
        AND state IS NOT NULL AND trim(state) <> ''
        AND city IS NOT NULL AND trim(city) <> ''
      ORDER BY country, state, city, name
    `);

    // Group data hierarchically (normalized keys)
    const locations: any = {};

    result.rows.forEach((row) => {
      const { country, state, city, hospital_id, hospital_name } = row;
      const countryKey = (country || "").toLowerCase().trim();
      const stateKey = (state || "").toLowerCase().trim();
      const cityKey = (city || "").toLowerCase().trim();
      if (!countryKey || !stateKey || !cityKey) return;

      if (!locations[countryKey]) {
        locations[countryKey] = {};
      }
      if (!locations[countryKey][stateKey]) {
        locations[countryKey][stateKey] = {};
      }
      if (!locations[countryKey][stateKey][cityKey]) {
        locations[countryKey][stateKey][cityKey] = [];
      }

      locations[countryKey][stateKey][cityKey].push({
        id: hospital_id,
        name: hospital_name,
      });
    });

    res.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch locations",
    });
  }
});

import rateLimit from "express-rate-limit";

const hospitalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Hospital login
router.post("/login", hospitalLoginLimiter, async (req, res) => {
  try {
    const { hospital_id, password } = req.body;

    if (!hospital_id || !password) {
      return res.status(400).json({
        success: false,
        error: "Hospital ID and password are required",
      });
    }

    // Find hospital by ID
    const result = await pool.query(
      "SELECT * FROM hospitals WHERE hospital_id = $1 AND is_active = true",
      [hospital_id],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Hospital ID not found or inactive",
      });
    }

    const hospital = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, hospital.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: "Invalid password. Please check your credentials and try again.",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        hospital_id: hospital.hospital_id,
        hospital_name: hospital.name,
        email: hospital.email,
        city: hospital.city,
        country: hospital.country,
      },
      process.env.JWT_SECRET || "organlink_secret_key_2024",
      { expiresIn: "24h" },
    );

    // Return hospital info without password and map name to hospital_name
    const { password: hospitalPassword, ...hospitalData } = hospital;
    const hospitalInfo = {
      ...hospitalData,
      hospital_name: hospitalData.name, // Map name to hospital_name for frontend compatibility
    };

    res.cookie("hospital_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({
      success: true,
      token,
      hospital: hospitalInfo,
    });
  } catch (error) {
    console.error("Hospital login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed",
    });
  }
});

// Verify hospital token
router.get("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "organlink_secret_key_2024",
    ) as any;

    // Get updated hospital info
    const result = await pool.query(
      "SELECT * FROM hospitals WHERE hospital_id = $1 AND is_active = true",
      [decoded.hospital_id],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Hospital not found",
      });
    }

    const { password_hash: hospitalPassword, ...hospitalData } = result.rows[0];
    const hospitalInfo = {
      ...hospitalData,
      hospital_name: hospitalData.name, // Map name to hospital_name for frontend compatibility
    };

    res.json({
      success: true,
      hospital: hospitalInfo,
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
});

// Request password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const { hospital_id, email } = req.body;

    if (!hospital_id || !email) {
      return res.status(400).json({
        success: false,
        error: "Hospital ID and email are required",
      });
    }

    // Verify hospital exists and get hospital name
    const hospitalResult = await pool.query(
      "SELECT hospital_id, name, email FROM hospitals WHERE hospital_id = $1 AND email = $2 AND is_active = true",
      [hospital_id, email],
    );

    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Hospital not found with provided ID and email",
      });
    }

    const hospital = hospitalResult.rows[0];

    // Create password reset request (request_id is auto-increment)
    const requestResult = await pool.query(
      `INSERT INTO password_reset_requests (hospital_id, requester_email, reason) 
       VALUES ($1, $2, $3)
       RETURNING request_id`,
      [hospital_id, email, `Password reset requested by hospital ${hospital.name}`],
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
        `Hospital "${hospital.name}" (ID: ${hospital_id}) has requested a password reset.`,
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
router.post("/logout", async (req, res) => {
  res.clearCookie("hospital_token");
  res.json({ success: true });
});

export default router;
