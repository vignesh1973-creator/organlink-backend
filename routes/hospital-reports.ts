import express from "express";
import { authenticateHospital } from "../middleware/auth";
import { pool } from "../config/database.js";
import { hospitalAnalyticsService } from "../services/hospitalAnalytics.js";

const router = express.Router();

// Get comprehensive report data
router.get("/", authenticateHospital, async (req, res) => {
  try {
    const hospitalId = req.hospital?.hospital_id;
    const range = req.query.range || "6months";

    let dateFilter = "";
    const currentDate = new Date();

    switch (range) {
      case "1month":
        dateFilter = `AND created_at >= '${new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()}'`;
        break;
      case "3months":
        dateFilter = `AND created_at >= '${new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()}'`;
        break;
      case "6months":
        dateFilter = `AND created_at >= '${new Date(currentDate.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString()}'`;
        break;
      case "1year":
        dateFilter = `AND created_at >= '${new Date(currentDate.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()}'`;
        break;
      default:
        dateFilter = "";
    }

    // Monthly stats
    const monthlyStatsQuery = `
      SELECT 
        TO_CHAR(date_trunc('month', created_at), 'Mon YYYY') as month,
        COUNT(CASE WHEN 'patients' = 'patients' THEN 1 END) as patients,
        0 as donors,
        0 as matches
      FROM (
        SELECT created_at FROM patients WHERE hospital_id = $1 ${dateFilter}
        UNION ALL
        SELECT created_at FROM donors WHERE hospital_id = $1 ${dateFilter}
      ) combined
      GROUP BY date_trunc('month', created_at)
      ORDER BY date_trunc('month', created_at)
    `;

    // Get actual monthly stats from database
    const monthlyPatientsQuery = `
      SELECT
        TO_CHAR(date_trunc('month', created_at), 'Mon YYYY') as month,
        COUNT(*) as patients
      FROM patients
      WHERE hospital_id = $1 ${dateFilter}
      GROUP BY date_trunc('month', created_at)
      ORDER BY date_trunc('month', created_at)
    `;

    const monthlyDonorsQuery = `
      SELECT
        TO_CHAR(date_trunc('month', created_at), 'Mon YYYY') as month,
        COUNT(*) as donors
      FROM donors
      WHERE hospital_id = $1 ${dateFilter}
      GROUP BY date_trunc('month', created_at)
      ORDER BY date_trunc('month', created_at)
    `;

    const [patientsResult, donorsResult] = await Promise.all([
      pool.query(monthlyPatientsQuery, [hospitalId]),
      pool.query(monthlyDonorsQuery, [hospitalId]),
    ]);

    // Combine monthly data
    const monthlyMap = new Map();
    patientsResult.rows.forEach((row) => {
      monthlyMap.set(row.month, {
        month: row.month,
        patients: parseInt(row.patients),
        donors: 0,
        matches: 0,
      });
    });
    donorsResult.rows.forEach((row) => {
      if (monthlyMap.has(row.month)) {
        monthlyMap.get(row.month).donors = parseInt(row.donors);
      } else {
        monthlyMap.set(row.month, {
          month: row.month,
          patients: 0,
          donors: parseInt(row.donors),
          matches: 0,
        });
      }
    });

    const monthlyStats = Array.from(monthlyMap.values()).sort(
      (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime(),
    );

    // Organ distribution - this query is now replaced by separate queries below
    // We'll use the organPatientsQuery and organDonorsQuery instead

    // Get actual organ distribution from database
    const organPatientsQuery = `
      SELECT
        organ_needed as organ,
        COUNT(*) as patients
      FROM patients
      WHERE hospital_id = $1 ${dateFilter}
      GROUP BY organ_needed
    `;

    const organDonorsQuery = `
      SELECT
        CASE
          WHEN jsonb_typeof(organs_to_donate::jsonb) = 'array' THEN
            TRIM(jsonb_array_elements_text(organs_to_donate::jsonb))
          ELSE
            TRIM(organs_to_donate::text, '"')
        END as organ,
        COUNT(*) as donors
      FROM donors
      WHERE hospital_id = $1 ${dateFilter} AND organs_to_donate IS NOT NULL
      GROUP BY 
        CASE
          WHEN jsonb_typeof(organs_to_donate::jsonb) = 'array' THEN
            TRIM(jsonb_array_elements_text(organs_to_donate::jsonb))
          ELSE
            TRIM(organs_to_donate::text, '"')
        END
    `;

    let organPatientsResult, organDonorsResult;
    try {
      [organPatientsResult, organDonorsResult] = await Promise.all([
        pool.query(organPatientsQuery, [hospitalId]),
        pool.query(organDonorsQuery, [hospitalId]),
      ]);
    } catch (error) {
      console.warn('Error fetching organ distribution:', error);
      organPatientsResult = { rows: [] };
      organDonorsResult = { rows: [] };
    }

    // Combine organ data
    const organMap = new Map();
    organPatientsResult.rows.forEach((row) => {
      organMap.set(row.organ, {
        organ: row.organ,
        patients: parseInt(row.patients),
        donors: 0,
        matches: 0,
      });
    });
    organDonorsResult.rows.forEach((row) => {
      if (organMap.has(row.organ)) {
        organMap.get(row.organ).donors = parseInt(row.donors);
      } else {
        organMap.set(row.organ, {
          organ: row.organ,
          patients: 0,
          donors: parseInt(row.donors),
          matches: 0,
        });
      }
    });

    const organDistribution = Array.from(organMap.values());

    // Get actual blood type stats from database
    const bloodPatientsQuery = `
      SELECT
        blood_type,
        COUNT(*) as patients
      FROM patients
      WHERE hospital_id = $1 ${dateFilter}
      GROUP BY blood_type
    `;

    const bloodDonorsQuery = `
      SELECT
        blood_type,
        COUNT(*) as donors
      FROM donors
      WHERE hospital_id = $1 ${dateFilter}
      GROUP BY blood_type
    `;

    const [bloodPatientsResult, bloodDonorsResult] = await Promise.all([
      pool.query(bloodPatientsQuery, [hospitalId]),
      pool.query(bloodDonorsQuery, [hospitalId]),
    ]);

    // Combine blood type data
    const bloodTypeMap = new Map();
    const allBloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

    allBloodTypes.forEach((type) => {
      bloodTypeMap.set(type, {
        bloodType: type,
        patients: 0,
        donors: 0,
        compatibility: 75,
      });
    });

    bloodPatientsResult.rows.forEach((row) => {
      if (bloodTypeMap.has(row.blood_type)) {
        bloodTypeMap.get(row.blood_type).patients = parseInt(row.patients);
      }
    });

    bloodDonorsResult.rows.forEach((row) => {
      if (bloodTypeMap.has(row.blood_type)) {
        bloodTypeMap.get(row.blood_type).donors = parseInt(row.donors);
      }
    });

    const bloodTypeStats = Array.from(bloodTypeMap.values()).filter(
      (item) => item.patients > 0 || item.donors > 0,
    );

    // Get actual urgency stats from database
    const urgencyQuery = `
      SELECT
        urgency_level as urgency,
        COUNT(*) as count
      FROM patients
      WHERE hospital_id = $1 ${dateFilter}
      GROUP BY urgency_level
    `;

    const urgencyResult = await pool.query(urgencyQuery, [hospitalId]);
    const totalPatients = urgencyResult.rows.reduce(
      (sum, row) => sum + parseInt(row.count),
      0,
    );

    const urgencyStats = urgencyResult.rows.map((row) => ({
      urgency: row.urgency,
      count: parseInt(row.count),
      percentage:
        totalPatients > 0
          ? Math.round((parseInt(row.count) / totalPatients) * 100)
          : 0,
    }));

    // Get actual age group stats from database
    const ageGroupPatientsQuery = `
      SELECT
        CASE
          WHEN age < 19 THEN '0-18'
          WHEN age < 36 THEN '19-35'
          WHEN age < 51 THEN '36-50'
          WHEN age < 66 THEN '51-65'
          ELSE '65+'
        END as age_group,
        COUNT(*) as patients
      FROM patients
      WHERE hospital_id = $1 ${dateFilter}
      GROUP BY
        CASE
          WHEN age < 19 THEN '0-18'
          WHEN age < 36 THEN '19-35'
          WHEN age < 51 THEN '36-50'
          WHEN age < 66 THEN '51-65'
          ELSE '65+'
        END
    `;

    const ageGroupDonorsQuery = `
      SELECT
        CASE
          WHEN age < 19 THEN '0-18'
          WHEN age < 36 THEN '19-35'
          WHEN age < 51 THEN '36-50'
          WHEN age < 66 THEN '51-65'
          ELSE '65+'
        END as age_group,
        COUNT(*) as donors
      FROM donors
      WHERE hospital_id = $1 ${dateFilter}
      GROUP BY
        CASE
          WHEN age < 19 THEN '0-18'
          WHEN age < 36 THEN '19-35'
          WHEN age < 51 THEN '36-50'
          WHEN age < 66 THEN '51-65'
          ELSE '65+'
        END
    `;

    const [agePatientResult, ageDonorResult] = await Promise.all([
      pool.query(ageGroupPatientsQuery, [hospitalId]),
      pool.query(ageGroupDonorsQuery, [hospitalId]),
    ]);

    // Combine age group data
    const ageGroupMap = new Map();
    const allAgeGroups = ["0-18", "19-35", "36-50", "51-65", "65+"];

    allAgeGroups.forEach((group) => {
      ageGroupMap.set(group, { ageGroup: group, patients: 0, donors: 0 });
    });

    agePatientResult.rows.forEach((row) => {
      ageGroupMap.get(row.age_group).patients = parseInt(row.patients);
    });

    ageDonorResult.rows.forEach((row) => {
      ageGroupMap.get(row.age_group).donors = parseInt(row.donors);
    });

    const ageGroupStats = Array.from(ageGroupMap.values()).filter(
      (item) => item.patients > 0 || item.donors > 0,
    );

    // Get actual matching stats from database (placeholder for now)
    const patientsCount = await pool.query(
      `SELECT COUNT(*) as count FROM patients WHERE hospital_id = $1 ${dateFilter}`,
      [hospitalId],
    );
    const donorsCount = await pool.query(
      `SELECT COUNT(*) as count FROM donors WHERE hospital_id = $1 ${dateFilter}`,
      [hospitalId],
    );

    const matchingStats = {
      totalRequests: parseInt(patientsCount.rows[0].count) || 0,
      successfulMatches:
        Math.floor(parseInt(patientsCount.rows[0].count) * 0.3) || 0, // 30% success rate estimate
      pendingRequests:
        Math.floor(parseInt(patientsCount.rows[0].count) * 0.2) || 0, // 20% pending estimate
      successRate: parseInt(patientsCount.rows[0].count) > 0 ? 75 : 0, // 75% baseline success rate
    };

    // Generate AI insights
    const aiInsights = await hospitalAnalyticsService.generateInsights(hospitalId, range);

    const reportData = {
      monthlyStats,
      organDistribution,
      bloodTypeStats,
      urgencyStats,
      matchingStats,
      ageGroupStats,
      aiInsights, // Add AI-powered insights
    };

    res.json(reportData);
  } catch (error) {
    console.error("Reports fetch error:", error);
    res.status(500).json({ error: "Failed to fetch report data" });
  }
});

// Get AI insights separately
router.get("/ai-insights", authenticateHospital, async (req, res) => {
  try {
    const hospitalId = req.hospital?.hospital_id;
    const range = req.query.range || "6months";

    const insights = await hospitalAnalyticsService.generateInsights(hospitalId!, range as string);

    res.json({
      success: true,
      insights,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("AI insights fetch error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to generate AI insights" 
    });
  }
});

// Export report data
router.get("/export", authenticateHospital, async (req, res) => {
  try {
    const format = req.query.format as string;
    const range = req.query.range || "6months";
    const hospitalId = req.hospital?.hospital_id;

    if (format === "pdf") {
      // For PDF export, you would typically use libraries like puppeteer or jsPDF
      // For now, return a simple text response
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="hospital-report-${range}.pdf"`,
      );
      res.send("PDF export functionality would be implemented here");
    } else if (format === "excel") {
      // For Excel export, you would use libraries like exceljs
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="hospital-report-${range}.xlsx"`,
      );
      res.send("Excel export functionality would be implemented here");
    } else {
      res.status(400).json({ error: "Invalid export format" });
    }
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Failed to export report" });
  }
});

export default router;
