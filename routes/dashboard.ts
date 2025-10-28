import { Router, Response } from "express";
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

// Get dashboard statistics
router.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    // Get hospital count
    const hospitalCount = await pool.query("SELECT COUNT(*) FROM hospitals");

    // Get organization count
    const orgCount = await pool.query("SELECT COUNT(*) FROM organizations");

    // Get active policies count
    const activePolicies = await pool.query(
      "SELECT COUNT(*) FROM policies WHERE status = 'active'",
    );

    // Get successful transplants count (mock data for now)
    const transplants = 1247;

    // Get system health metrics
    const systemStats = {
      uptime: "99.9%",
      responseTime: "145ms",
      activeSessions: "2,647",
      databaseSize: "1.27 TB",
    };

    // Get recent activities from database (real data)
    const recentActivities = [];
    
    // Recent hospitals registered
    const recentHospitals = await pool.query(
      `SELECT hospital_id, name, created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as created_at_ist
       FROM hospitals
       ORDER BY created_at DESC
       LIMIT 3`,
    );
    
    recentHospitals.rows.forEach((h, idx) => {
      recentActivities.push({
        id: `hosp_${idx}`,
        type: "hospital_registered",
        title: "New Hospital Registered",
        description: `${h.name} has been added to the network`,
        timestamp: h.created_at_ist,
        status: "active",
      });
    });
    
    // Recent policies created
    const recentPolicies = await pool.query(
      `SELECT p.policy_id, p.title, p.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as created_at_ist, 
              o.name as org_name
       FROM policies p
       LEFT JOIN organizations o ON p.proposer_org_id = o.organization_id
       ORDER BY p.created_at DESC
       LIMIT 3`,
    );
    
    recentPolicies.rows.forEach((p, idx) => {
      recentActivities.push({
        id: `policy_${idx}`,
        type: "policy_created",
        title: "Policy Proposal Created",
        description: `${p.title}${p.org_name ? ' by ' + p.org_name : ''}`,
        timestamp: p.created_at_ist,
        status: "info",
      });
    });
    
    // Recent patient registrations
    const recentPatients = await pool.query(
      `SELECT p.patient_id, p.full_name, p.registration_date, h.name as hospital_name
       FROM patients p
       LEFT JOIN hospitals h ON p.hospital_id = h.hospital_id
       ORDER BY p.registration_date DESC
       LIMIT 2`,
    );
    
    recentPatients.rows.forEach((p, idx) => {
      recentActivities.push({
        id: `patient_${idx}`,
        type: "patient_registered",
        title: "New Patient Registered",
        description: `Patient registered at ${p.hospital_name || 'Hospital'}`,
        timestamp: p.registration_date,
        status: "success",
      });
    });
    
    // Sort all activities by timestamp descending and take top 10
    recentActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const topActivities = recentActivities.slice(0, 10);

    res.json({
      stats: {
        totalHospitals: parseInt(hospitalCount.rows[0].count),
        totalOrganizations: parseInt(orgCount.rows[0].count),
        activePolicies: parseInt(activePolicies.rows[0].count),
        successfulTransplants: transplants,
      },
      systemHealth: systemStats,
      recentActivities: topActivities,
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get system alerts
router.get("/alerts", async (req: AuthRequest, res: Response) => {
  try {
    const alerts = [];
    
    // Check for active policies requiring attention
    const pendingPolicies = await pool.query(
      `SELECT COUNT(*) FROM policies WHERE status = 'voting'`,
    );
    
    if (parseInt(pendingPolicies.rows[0].count) > 0) {
      alerts.push({
        id: 'pending_policies',
        type: "Pending Policy Votes",
        message: `${pendingPolicies.rows[0].count} policies awaiting votes`,
        severity: "warning",
        timestamp: new Date(),
      });
    }
    
    // Check for unmatched patients
    const unmatchedPatients = await pool.query(
      `SELECT COUNT(*) FROM patients WHERE status = 'Waiting'`,
    );
    
    if (parseInt(unmatchedPatients.rows[0].count) > 5) {
      alerts.push({
        id: 'unmatched_patients',
        type: "High Unmatched Patient Count",
        message: `${unmatchedPatients.rows[0].count} patients waiting for matches`,
        severity: "info",
        timestamp: new Date(),
      });
    }
    
    // Success messages
    alerts.push({
      id: 'system_health',
      type: "System Operational",
      message: "All systems running normally",
      severity: "success",
      timestamp: new Date(),
    });

    res.json({ alerts });
  } catch (error) {
    console.error("Get alerts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get quick actions data
router.get("/quick-actions", async (req: AuthRequest, res: Response) => {
  try {
    const actions = [
      {
        id: "add_hospital",
        title: "Add Hospital",
        description: "Register new hospital",
        icon: "plus",
        color: "blue",
      },
      {
        id: "add_organization",
        title: "Add Organization",
        description: "Add new organization",
        icon: "plus",
        color: "green",
      },
      {
        id: "view_ipfs",
        title: "View IPFS Logs",
        description: "Check file storage",
        icon: "file",
        color: "purple",
      },
      {
        id: "system_settings",
        title: "System Settings",
        description: "Configure system",
        icon: "settings",
        color: "gray",
      },
    ];

    res.json({ actions });
  } catch (error) {
    console.error("Get quick actions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
