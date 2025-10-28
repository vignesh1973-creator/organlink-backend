import express from "express";
import { pool } from "../config/database.js";
import { authenticateHospital } from "../middleware/auth.js";

const router = express.Router();

// Get all notifications for the hospital
router.get("/", authenticateHospital, async (req, res) => {
  try {
    const hospitalId = req.hospital?.hospital_id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Auto-cleanup: Delete read notifications older than 7 days
    await pool.query(
      `DELETE FROM notifications 
       WHERE hospital_id = $1 
         AND is_read = true 
         AND created_at < NOW() - INTERVAL '7 days'`,
      [hospitalId]
    );

    // Fetch notifications (unread + recent read) with IST timezone
    const result = await pool.query(
      `SELECT 
         notification_id, hospital_id, type, title, message, related_id, is_read,
         created_at,
         created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as created_at_ist
       FROM notifications 
       WHERE hospital_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [hospitalId, limit, offset],
    );

    res.json({
      success: true,
      notifications: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notifications",
    });
  }
});

// Get unread notification count
router.get("/unread-count", authenticateHospital, async (req, res) => {
  try {
    const hospitalId = req.hospital?.hospital_id;

    const result = await pool.query(
      "SELECT COUNT(*) as count FROM notifications WHERE hospital_id = $1 AND is_read = false",
      [hospitalId],
    );

    res.json({
      success: true,
      unreadCount: parseInt(result.rows[0].count),
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get unread count",
    });
  }
});

// Mark a notification as read
router.put("/:notificationId/read", authenticateHospital, async (req, res) => {
  try {
    const hospitalId = req.hospital?.hospital_id;
    const { notificationId } = req.params;

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true
       WHERE notification_id = $1 AND hospital_id = $2`,
      [notificationId, hospitalId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark notification as read",
    });
  }
});

// Mark all notifications as read
router.put("/mark-all-read", authenticateHospital, async (req, res) => {
  try {
    const hospitalId = req.hospital?.hospital_id;

    await pool.query(
      `UPDATE notifications
       SET is_read = true
       WHERE hospital_id = $1 AND is_read = false`,
      [hospitalId],
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark all notifications as read",
    });
  }
});

// Delete a notification
router.delete("/:notificationId", authenticateHospital, async (req, res) => {
  try {
    const hospitalId = req.hospital?.hospital_id;
    const { notificationId } = req.params;

    const result = await pool.query(
      "DELETE FROM notifications WHERE notification_id = $1 AND hospital_id = $2",
      [notificationId, hospitalId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete notification",
    });
  }
});

// Create a new notification (typically used by system/other services)
router.post("/", authenticateHospital, async (req, res) => {
  try {
    const { hospital_id, type, title, message, related_id } = req.body;

    if (!hospital_id || !type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: hospital_id, type, title, message",
      });
    }

    const notificationId = `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(
      `INSERT INTO notifications (notification_id, hospital_id, type, title, message, related_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [notificationId, hospital_id, type, title, message, related_id || null],
    );

    res.json({
      success: true,
      notification_id: notificationId,
      message: "Notification created successfully",
    });
  } catch (error) {
    console.error("Create notification error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create notification",
    });
  }
});

// Test notification creation (for development)
router.post("/test", authenticateHospital, async (req, res) => {
  try {
    const hospitalId = req.hospital?.hospital_id;

    const testNotifications = [
      {
        type: "organ_match",
        title: "New Organ Match Found!",
        message:
          "A potential heart donor has been found for Patient ID: P001. Blood type O+ with 95% compatibility.",
        related_id: "P001",
      },
      {
        type: "match_response",
        title: "Match Request Accepted",
        message:
          "Your organ request for kidney transplant has been accepted by City General Hospital.",
        related_id: "REQ001",
      },
      {
        type: "urgent_case",
        title: "Critical Patient Alert",
        message:
          "Patient John Doe (ID: P002) condition has been upgraded to critical. Immediate attention required.",
        related_id: "P002",
      },
      {
        type: "system",
        title: "System Maintenance",
        message:
          "Scheduled maintenance will occur tonight from 2:00 AM to 4:00 AM. Some features may be unavailable.",
        related_id: null,
      },
    ];

    for (const notification of testNotifications) {
      const notificationId = `TEST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await pool.query(
        `INSERT INTO notifications (notification_id, hospital_id, type, title, message, related_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          notificationId,
          hospitalId,
          notification.type,
          notification.title,
          notification.message,
          notification.related_id,
        ],
      );
    }

    res.json({
      success: true,
      message: "Test notifications created successfully",
      count: testNotifications.length,
    });
  } catch (error) {
    console.error("Create test notifications error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create test notifications",
    });
  }
});

export default router;
