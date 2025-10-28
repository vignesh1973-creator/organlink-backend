import express from "express";
import { pool } from "../config/database.js";
import { authenticateHospital } from "../middleware/auth.js";

const router = express.Router();

// Get hospital dashboard statistics
router.get("/stats", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    // Get patient statistics
    const patientStats = await pool.query(
      `SELECT 
        COUNT(*) as total_patients,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_patients,
        COUNT(CASE WHEN signature_verified = true THEN 1 END) as verified_patients,
        COUNT(CASE WHEN urgency_level = 'High' THEN 1 END) as urgent_patients
       FROM patients 
       WHERE hospital_id = $1`,
      [hospital_id],
    );

    // Get donor statistics
    const donorStats = await pool.query(
      `SELECT 
        COUNT(*) as total_donors,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_donors,
        COUNT(CASE WHEN signature_verified = true THEN 1 END) as verified_donors
       FROM donors 
       WHERE hospital_id = $1`,
      [hospital_id],
    );

    // Get matching requests statistics
    const matchingStats = await pool.query(
      `SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_requests,
        COUNT(CASE WHEN status = 'matched' THEN 1 END) as successful_matches,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_requests
       FROM matching_requests 
       WHERE requesting_hospital_id = $1`,
      [hospital_id],
    );

    // Get recent activities
    const recentActivities = await pool.query(
      `SELECT 
        'patient' as type,
        patient_id as record_id,
        full_name as name,
        'Patient Registration' as activity,
        created_at
       FROM patients 
       WHERE hospital_id = $1
       UNION ALL
       SELECT 
        'donor' as type,
        donor_id as record_id,
        full_name as name,
        'Donor Registration' as activity,
        created_at
       FROM donors 
       WHERE hospital_id = $1
       ORDER BY created_at DESC 
       LIMIT 10`,
      [hospital_id],
    );

    // Get organ distribution
    const organDistribution = await pool.query(
      `SELECT 
        organ_needed,
        COUNT(*) as count
       FROM patients 
       WHERE hospital_id = $1 AND is_active = true
       GROUP BY organ_needed
       ORDER BY count DESC`,
      [hospital_id],
    );

    // Get blood type distribution
    const bloodTypeDistribution = await pool.query(
      `SELECT 
        blood_type,
        COUNT(*) as patient_count,
        (SELECT COUNT(*) FROM donors WHERE blood_type = p.blood_type AND hospital_id = $1 AND is_active = true) as donor_count
       FROM patients p
       WHERE hospital_id = $1 AND is_active = true
       GROUP BY blood_type
       ORDER BY patient_count DESC`,
      [hospital_id],
    );

    // Get notifications count
    const notificationCount = await pool.query(
      `SELECT COUNT(*) as unread_count
       FROM notifications 
       WHERE hospital_id = $1 AND is_read = false`,
      [hospital_id],
    );

    res.json({
      success: true,
      stats: {
        patients: patientStats.rows[0],
        donors: donorStats.rows[0],
        matching: matchingStats.rows[0],
        notifications: notificationCount.rows[0],
      },
      recentActivities: recentActivities.rows,
      organDistribution: organDistribution.rows,
      bloodTypeDistribution: bloodTypeDistribution.rows,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard statistics",
    });
  }
});

// Get hospital profile
router.get("/profile", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    const result = await pool.query(
      `SELECT hospital_id, name, country, state, city, email, phone, address, is_active, created_at
       FROM hospitals WHERE hospital_id = $1`,
      [hospital_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Hospital not found",
      });
    }

    const hospitalProfile = result.rows[0];

    res.json({
      success: true,
      profile: hospitalProfile,
    });
  } catch (error) {
    console.error("Error fetching hospital profile:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch hospital profile",
    });
  }
});

// Get notifications for hospital
router.get("/notifications", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { limit = 20, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE hospital_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [hospital_id, limit, offset],
    );

    res.json({
      success: true,
      notifications: result.rows,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notifications",
    });
  }
});

// Mark notification as read
router.patch(
  "/notifications/:notification_id/read",
  authenticateHospital,
  async (req, res) => {
    try {
      const hospital_id = req.hospital?.hospital_id;
      const { notification_id } = req.params;

      await pool.query(
        `UPDATE notifications 
       SET is_read = true 
       WHERE notification_id = $1 AND hospital_id = $2`,
        [notification_id, hospital_id],
      );

      res.json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({
        success: false,
        error: "Failed to mark notification as read",
      });
    }
  },
);

export default router;
