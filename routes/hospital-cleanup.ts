import express from "express";
import { pool } from "../config/database.js";
import { authenticateHospital } from "../middleware/auth.js";

const router = express.Router();

// Clear all data for a hospital (for testing purposes)
router.delete("/clear-all", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    // Delete all patients for this hospital
    await pool.query("DELETE FROM patients WHERE hospital_id = $1", [
      hospital_id,
    ]);

    // Delete all donors for this hospital
    await pool.query("DELETE FROM donors WHERE hospital_id = $1", [
      hospital_id,
    ]);

    // Delete all notifications for this hospital
    await pool.query("DELETE FROM notifications WHERE hospital_id = $1", [
      hospital_id,
    ]);

    res.json({
      success: true,
      message: "All hospital data cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing hospital data:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear hospital data",
    });
  }
});

// Clear only donors
router.delete("/clear-donors", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    const result = await pool.query(
      "DELETE FROM donors WHERE hospital_id = $1",
      [hospital_id],
    );

    res.json({
      success: true,
      message: `Deleted ${result.rowCount} donors successfully`,
    });
  } catch (error) {
    console.error("Error clearing donors:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear donors",
    });
  }
});

// Clear only patients
router.delete("/clear-patients", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    const result = await pool.query(
      "DELETE FROM patients WHERE hospital_id = $1",
      [hospital_id],
    );

    res.json({
      success: true,
      message: `Deleted ${result.rowCount} patients successfully`,
    });
  } catch (error) {
    console.error("Error clearing patients:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear patients",
    });
  }
});

export default router;
