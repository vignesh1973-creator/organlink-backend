import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/database";
import {
  authenticateToken,
  requireAdmin,
  AuthRequest,
} from "../middleware/auth";

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Get all password reset requests
router.get("/requests", async (req: AuthRequest, res: Response) => {
  try {
    const { status = "all" } = req.query;

    let query = `
      SELECT 
        prr.*,
        h.name as hospital_name,
        h.hospital_id,
        o.name as organization_name,
        o.organization_id
      FROM password_reset_requests prr
      LEFT JOIN hospitals h ON prr.hospital_id = h.hospital_id
      LEFT JOIN organizations o ON prr.organization_id = o.organization_id
      WHERE 1=1
    `;

    const params: any[] = [];
    if (status !== "all") {
      params.push(status);
      query += ` AND prr.status = $1`;
    }

    query += ` ORDER BY prr.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      requests: result.rows.map(row => ({
        ...row,
        entity_type: row.hospital_id ? 'hospital' : 'organization',
        entity_name: row.hospital_name || row.organization_name,
        entity_id: row.hospital_id || row.organization_id,
      })),
    });
  } catch (error) {
    console.error("Get password reset requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get notifications for password reset requests
router.get("/notifications", async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT n.*, 
              prr.hospital_id,
              prr.organization_id,
              h.name as hospital_name,
              o.name as organization_name
       FROM notifications n
       LEFT JOIN password_reset_requests prr ON n.related_id = prr.request_id::text
       LEFT JOIN hospitals h ON prr.hospital_id = h.hospital_id
       LEFT JOIN organizations o ON prr.organization_id = o.organization_id
       WHERE n.hospital_id = 'ADMIN' 
       AND n.type = 'password_reset_request'
       AND n.is_read = false
       ORDER BY n.created_at DESC`
    );

    // Also get policy proposal notifications
    const policyNotifs = await pool.query(
      `SELECT 
        'policy_proposed' as type,
        p.id as related_id,
        p.title,
        p.description,
        o.name as proposer_name,
        p.created_at
       FROM blockchain_policy_proposals p
       LEFT JOIN organizations o ON p.organization_id = o.organization_id
       WHERE p.created_at > NOW() - INTERVAL '7 days'
       ORDER BY p.created_at DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      password_resets: result.rows.map(row => ({
        ...row,
        entity_type: row.hospital_id ? 'hospital' : 'organization',
        entity_name: row.hospital_name || row.organization_name,
        entity_id: row.hospital_id || row.organization_id,
      })),
      policy_proposals: policyNotifs.rows,
    });
  } catch (error) {
    console.error("Get admin notifications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset password for hospital or organization
router.post("/reset-password", async (req: AuthRequest, res: Response) => {
  try {
    const { request_id, new_password, admin_notes } = req.body;

    if (!request_id || !new_password) {
      return res.status(400).json({
        error: "Request ID and new password are required",
      });
    }

    // Get the reset request
    const requestResult = await pool.query(
      `SELECT * FROM password_reset_requests WHERE request_id = $1`,
      [request_id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: "Reset request not found" });
    }

    const resetRequest = requestResult.rows[0];

    // Hash the new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update password based on entity type
    if (resetRequest.hospital_id) {
      await pool.query(
        `UPDATE hospitals SET password_hash = $1 WHERE hospital_id = $2`,
        [hashedPassword, resetRequest.hospital_id]
      );
    } else if (resetRequest.organization_id) {
      await pool.query(
        `UPDATE organizations SET password_hash = $1 WHERE organization_id = $2`,
        [hashedPassword, resetRequest.organization_id]
      );
    }

    // Update the reset request status
    await pool.query(
      `UPDATE password_reset_requests 
       SET status = 'approved', 
           admin_notes = $1,
           resolved_at = CURRENT_TIMESTAMP
       WHERE request_id = $2`,
      [admin_notes || 'Password reset by admin', request_id]
    );

    // Mark admin notification as read
    await pool.query(
      `UPDATE notifications 
       SET is_read = true 
       WHERE type = 'password_reset_request' 
       AND related_id = $1`,
      [request_id.toString()]
    );

    // Create notification for hospital/organization
    const notification_id = `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const notificationMessage = resetRequest.hospital_id
      ? 'Your password has been reset by the admin. Please use your new password to login.'
      : 'Your password has been reset by the admin. Please use your new password to login.';

    const entityId = resetRequest.hospital_id || resetRequest.organization_id;
    if (entityId) {
      await pool.query(
        `INSERT INTO notifications (notification_id, hospital_id, organization_id, type, title, message, related_id) 
         VALUES ($1, $2, $3, 'password_reset_complete', 'Password Reset Completed', $4, $5)`,
        [
          notification_id,
          resetRequest.hospital_id || null,
          resetRequest.organization_id || null,
          notificationMessage,
          request_id.toString(),
        ]
      );
    }

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reject password reset request
router.post("/reject-request", async (req: AuthRequest, res: Response) => {
  try {
    const { request_id, admin_notes } = req.body;

    if (!request_id) {
      return res.status(400).json({ error: "Request ID is required" });
    }

    await pool.query(
      `UPDATE password_reset_requests 
       SET status = 'rejected', 
           admin_notes = $1,
           resolved_at = CURRENT_TIMESTAMP
       WHERE request_id = $1`,
      [admin_notes || 'Request rejected by admin', request_id]
    );

    // Mark notification as read
    await pool.query(
      `UPDATE notifications 
       SET is_read = true 
       WHERE type = 'password_reset_request' 
       AND related_id = $1`,
      [request_id.toString()]
    );

    res.json({
      success: true,
      message: "Request rejected",
    });
  } catch (error) {
    console.error("Reject request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
