import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/database";
import {
  generateToken,
  authenticateToken,
  AuthRequest,
} from "../middleware/auth";

const router = Router();

import rateLimit from "express-rate-limit";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin login
router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Special case for default admin credentials
    if (username === "admin" && password === "admin123") {
      const token = generateToken({
        id: "admin-default",
        email: "admin@organlink.org",
        type: "admin",
      });

      res.cookie("admin_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.json({
        success: true,
        token,
        user: {
          id: "admin-default",
          email: "admin@organlink.org",
          type: "admin",
        },
      });
    }

    // Check database for admin
    const result = await pool.query("SELECT * FROM admins WHERE email = $1", [
      username,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const admin = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, admin.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken({
      id: admin.id,
      email: admin.email,
      type: "admin",
    });

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({
      success: true,
      token,
      user: {
        id: admin.id,
        email: admin.email,
        type: "admin",
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Verify token
router.get("/verify", authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// Logout: clear cookie
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("admin_token");
  res.json({ success: true, message: "Logged out successfully" });
});

export default router;
