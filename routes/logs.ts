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

// Get IPFS logs
router.get("/ipfs", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, status, fileType } = req.query;

    let query = `
      SELECT * FROM ipfs_logs 
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (status && status !== "all") {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (fileType && fileType !== "all") {
      paramCount++;
      query += ` AND file_type = $${paramCount}`;
      params.push(fileType);
    }

    query += ` ORDER BY upload_date DESC`;

    const offset = (Number(page) - 1) * Number(limit);
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) FROM ipfs_logs WHERE 1=1";
    const countParams: any[] = [];
    let countParamCount = 0;

    if (status && status !== "all") {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    if (fileType && fileType !== "all") {
      countParamCount++;
      countQuery += ` AND file_type = $${countParamCount}`;
      countParams.push(fileType);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // If no data exists, create some sample data
    if (result.rows.length === 0 && total === 0) {
      const sampleData = [
        {
          hash: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
          file_type: "Signature",
          size_mb: 0.5,
          status: "active",
          uploaded_by: "Central Medical Center",
        },
        {
          hash: "QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd",
          file_type: "Document",
          size_mb: 2.1,
          status: "active",
          uploaded_by: "Hope Foundation",
        },
        {
          hash: "QmNLei78zWmzUdbeRB3CiUfAizWUrbeeZh5K1rhAQKCh51",
          file_type: "Signature",
          size_mb: 0.3,
          status: "pending",
          uploaded_by: "Metro Medical",
        },
        {
          hash: "QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4",
          file_type: "Certificate",
          size_mb: 1.8,
          status: "active",
          uploaded_by: "Global Health Org",
        },
      ];

      for (const item of sampleData) {
        await pool.query(
          `
          INSERT INTO ipfs_logs (hash, file_type, size_mb, status, uploaded_by)
          VALUES ($1, $2, $3, $4, $5)
        `,
          [
            item.hash,
            item.file_type,
            item.size_mb,
            item.status,
            item.uploaded_by,
          ],
        );
      }

      // Re-run the query
      const newResult = await pool.query(query, params);
      const newCountResult = await pool.query(countQuery, countParams);

      return res.json({
        logs: newResult.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(newCountResult.rows[0].count),
          pages: Math.ceil(
            parseInt(newCountResult.rows[0].count) / Number(limit),
          ),
        },
      });
    }

    res.json({
      logs: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get IPFS logs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get blockchain events
router.get("/blockchain", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, eventType, status } = req.query;

    let query = `
      SELECT * FROM blockchain_events 
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (eventType && eventType !== "all") {
      paramCount++;
      query += ` AND event_type = $${paramCount}`;
      params.push(eventType);
    }

    if (status && status !== "all") {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const offset = (Number(page) - 1) * Number(limit);
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) FROM blockchain_events WHERE 1=1";
    const countParams: any[] = [];
    let countParamCount = 0;

    if (eventType && eventType !== "all") {
      countParamCount++;
      countQuery += ` AND event_type = $${countParamCount}`;
      countParams.push(eventType);
    }

    if (status && status !== "all") {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // If no data exists, create some sample data
    if (result.rows.length === 0 && total === 0) {
      const sampleData = [
        {
          event_type: "DonorRegistered",
          transaction_hash:
            "0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3",
          block_number: 18500000,
          gas_used: 21000,
          gas_fee: 0.001,
          status: "confirmed",
        },
        {
          event_type: "PatientRegistered",
          transaction_hash:
            "0xa3b2c1d4e5f6789012345678901234567890123456789012345678901234567890",
          block_number: 18500001,
          gas_used: 25000,
          gas_fee: 0.0012,
          status: "confirmed",
        },
        {
          event_type: "PolicyProposed",
          transaction_hash:
            "0xb1c2d3e4f5a6789012345678901234567890123456789012345678901234567890",
          block_number: 18500002,
          gas_used: 35000,
          gas_fee: 0.0015,
          status: "pending",
        },
        {
          event_type: "MatchFound",
          transaction_hash:
            "0xc2d3e4f5a6b789012345678901234567890123456789012345678901234567890",
          block_number: 18500003,
          gas_used: 45000,
          gas_fee: 0.002,
          status: "confirmed",
        },
        {
          event_type: "TransplantCompleted",
          transaction_hash:
            "0xd3e4f5a6b7c789012345678901234567890123456789012345678901234567890",
          block_number: 18500004,
          gas_used: 55000,
          gas_fee: 0.0025,
          status: "failed",
        },
      ];

      for (const item of sampleData) {
        await pool.query(
          `
          INSERT INTO blockchain_events (event_type, transaction_hash, block_number, gas_used, gas_fee, status)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            item.event_type,
            item.transaction_hash,
            item.block_number,
            item.gas_used,
            item.gas_fee,
            item.status,
          ],
        );
      }

      // Re-run the query
      const newResult = await pool.query(query, params);
      const newCountResult = await pool.query(countQuery, countParams);

      return res.json({
        events: newResult.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(newCountResult.rows[0].count),
          pages: Math.ceil(
            parseInt(newCountResult.rows[0].count) / Number(limit),
          ),
        },
      });
    }

    res.json({
      events: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get blockchain events error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get policies data
router.get("/policies", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, status, category } = req.query;

    let query = `
      SELECT p.*, o.name as proposer_name 
      FROM policies p 
      LEFT JOIN organizations o ON p.proposer_org_id = o.organization_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (status && status !== "all") {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(status);
    }

    if (category && category !== "all") {
      paramCount++;
      query += ` AND p.category = $${paramCount}`;
      params.push(category);
    }

    query += ` ORDER BY p.created_at DESC`;

    const offset = (Number(page) - 1) * Number(limit);
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) FROM policies WHERE 1=1";
    const countParams: any[] = [];
    let countParamCount = 0;

    if (status && status !== "all") {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    if (category && category !== "all") {
      countParamCount++;
      countQuery += ` AND category = $${countParamCount}`;
      countParams.push(category);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // If no data exists, create some sample data
    if (result.rows.length === 0 && total === 0) {
      const sampleData = [
        {
          title: "Updated Organ Age Limits for Heart Transplants",
          description:
            "Proposed changes to age limit criteria for heart transplants",
          category: "Organ Rules",
          status: "approved",
          votes_for: 15,
          votes_against: 3,
        },
        {
          title: "AI Matching Algorithm Updates",
          description: "Implementation of enhanced AI matching algorithms",
          category: "Technical",
          status: "voting",
          votes_for: 8,
          votes_against: 2,
        },
        {
          title: "Cross-Border Organ Sharing Protocol",
          description: "Framework for international organ sharing agreements",
          category: "International",
          status: "approved",
          votes_for: 20,
          votes_against: 1,
        },
        {
          title: "Emergency Organ Allocation Priority",
          description: "Priority guidelines for emergency organ allocation",
          category: "Emergency",
          status: "rejected",
          votes_for: 5,
          votes_against: 12,
        },
        {
          title: "Pediatric Organ Consent Protocols",
          description:
            "Updated consent procedures for pediatric organ donations",
          category: "Legal",
          status: "draft",
          votes_for: 0,
          votes_against: 0,
        },
      ];

      for (const item of sampleData) {
        await pool.query(
          `
          INSERT INTO policies (title, description, category, status, votes_for, votes_against)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            item.title,
            item.description,
            item.category,
            item.status,
            item.votes_for,
            item.votes_against,
          ],
        );
      }

      // Re-run the query
      const newResult = await pool.query(query, params);
      const newCountResult = await pool.query(countQuery, countParams);

      return res.json({
        policies: newResult.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(newCountResult.rows[0].count),
          pages: Math.ceil(
            parseInt(newCountResult.rows[0].count) / Number(limit),
          ),
        },
      });
    }

    res.json({
      policies: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get policies error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
