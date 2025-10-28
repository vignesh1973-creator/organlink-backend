import express from "express";
import { pool } from "../config/database.js";
import { authenticateHospital } from "../middleware/auth.js";
import { aiMatchingService } from "../services/aiMatching.js";
import {
  findEnhancedMatches,
  predictTransplantSuccess,
  generateMatchingInsights,
} from "../services/enhancedAiMatching";
import { ipfsService } from "../services/ipfs.js";

const router = express.Router();

// Find matches for a patient
router.post("/find-matches", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { patient_id, organ_type, blood_type, urgency_level } = req.body;

    if (!patient_id || !organ_type || !blood_type || !urgency_level) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: patient_id, organ_type, blood_type, urgency_level",
      });
    }

    // Verify patient belongs to this hospital
    const patientResult = await pool.query(
      "SELECT patient_id FROM patients WHERE patient_id = $1 AND hospital_id = $2",
      [patient_id, hospital_id],
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found or doesn't belong to your hospital",
      });
    }

    const matchingResult = await aiMatchingService.findMatches({
      patient_id,
      organ_type,
      blood_type,
      urgency_level,
      hospital_id: hospital_id!,
    });

    res.json({
      success: true,
      ...matchingResult,
    });
  } catch (error) {
    console.error("Find matches error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to find matches",
    });
  }
});

// Create a matching request
router.post("/create-request", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { patient_id, organ_type, blood_type, urgency_level } = req.body;

    if (!patient_id || !organ_type || !blood_type || !urgency_level) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // Verify patient belongs to this hospital
    const patientResult = await pool.query(
      "SELECT patient_id FROM patients WHERE patient_id = $1 AND hospital_id = $2",
      [patient_id, hospital_id],
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found or doesn't belong to your hospital",
      });
    }

    const requestId = await aiMatchingService.createMatchingRequest({
      patient_id,
      organ_type,
      blood_type,
      urgency_level,
      hospital_id: hospital_id!,
    });

    res.json({
      success: true,
      request_id: requestId,
      message: "Matching request created successfully",
    });
  } catch (error) {
    console.error("Create matching request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create matching request",
    });
  }
});

// Get all matching requests for the hospital
router.get("/requests", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    const requests = await aiMatchingService.getMatchingRequests(hospital_id!);

    res.json({
      success: true,
      requests,
    });
  } catch (error) {
    console.error("Get matching requests error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get matching requests",
    });
  }
});

// Get outgoing requests (sent by this hospital to other hospitals)
router.get("/outgoing-requests", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    // Get organ requests sent by this hospital
    const result = await pool.query(
      `SELECT or_req.*, 
              p.full_name as patient_name, p.organ_needed, p.blood_type, p.urgency_level,
              d.full_name as donor_name,
              h_to.name as donor_hospital_name, h_to.city as donor_city, h_to.state as donor_state,
              to_char(or_req.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') as created_at_ist,
              to_char(or_req.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') as updated_at_ist
       FROM organ_requests or_req
       LEFT JOIN patients p ON or_req.patient_id = p.patient_id
       LEFT JOIN donors d ON or_req.donor_id = d.donor_id
       LEFT JOIN hospitals h_to ON or_req.to_hospital_id = h_to.hospital_id
       WHERE or_req.from_hospital_id = $1
       ORDER BY or_req.created_at DESC`,
      [hospital_id],
    );

    res.json({
      success: true,
      outgoing_requests: result.rows,
    });
  } catch (error) {
    console.error("Get outgoing requests error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get outgoing requests",
    });
  }
});

// Get requests received by this hospital (as donor hospital) with response history
// Only show requests that have been DECIDED (accepted or rejected), not pending
router.get("/received-requests", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    // Get organ requests that have been responded to (accepted or rejected)
    const result = await pool.query(
      `SELECT or_req.*, 
              or_req.is_viewed_by_donor_hospital as is_viewed,
              p.full_name as patient_name, p.organ_needed, p.blood_type, p.urgency_level,
              d.full_name as donor_name,
              h_from.name as requesting_hospital_name, h_from.city as requesting_city, h_from.state as requesting_state,
              or_req.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as created_at_ist,
              or_req.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as updated_at_ist
       FROM organ_requests or_req
       INNER JOIN patients p ON or_req.patient_id = p.patient_id
       LEFT JOIN donors d ON or_req.donor_id = d.donor_id
       LEFT JOIN hospitals h_from ON or_req.from_hospital_id = h_from.hospital_id
       WHERE or_req.to_hospital_id = $1
         AND or_req.status IN ('accepted', 'rejected')
       ORDER BY or_req.updated_at DESC`,
      [hospital_id],
    );

    res.json({
      success: true,
      received_requests: result.rows,
    });
  } catch (error) {
    console.error("Get received requests error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get received requests",
    });
  }
});

// Get potential donors for incoming match requests (when other hospitals need organs)
// Only show PENDING requests (not yet accepted/rejected)
router.get("/incoming-matches", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    // Get notifications about organ requests where status is still 'pending'
    // Only show requests where patient still exists and request is pending
    const result = await pool.query(
      `SELECT n.*, 
              or_req.patient_id, or_req.donor_id, or_req.status as request_status, or_req.notes,
              p.full_name as patient_name, p.organ_needed, p.blood_type, p.urgency_level,
              h_from.name as requesting_hospital_name, h_from.city as requesting_city, h_from.state as requesting_state
       FROM notifications n
       LEFT JOIN organ_requests or_req ON n.related_id = or_req.request_id
       LEFT JOIN patients p ON or_req.patient_id = p.patient_id
       LEFT JOIN hospitals h_from ON or_req.from_hospital_id = h_from.hospital_id
       WHERE n.hospital_id = $1 
         AND n.type IN ('organ_request', 'organ_match')
         AND or_req.request_id IS NOT NULL
         AND p.patient_id IS NOT NULL
         AND or_req.status = 'pending'
       ORDER BY n.created_at DESC`,
      [hospital_id],
    );

    const incomingMatches = result.rows.map((row) => {
      let metadata = row.metadata;
      if (typeof metadata === "string" && metadata.trim()) {
        try {
          metadata = JSON.parse(metadata);
        } catch {
          metadata = null;
        }
      }
      return {
        ...row,
        metadata,
      };
    });

    res.json({
      success: true,
      incoming_matches: incomingMatches,
    });
  } catch (error) {
    console.error("Get incoming matches error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get incoming matches",
    });
  }
});

// Respond to a matching request (accept/reject)
router.post("/respond", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { request_id, donor_id, response, notes } = req.body;

    if (!request_id || !response || !["accept", "reject"].includes(response)) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid request. Required: request_id, response (accept/reject)",
      });
    }

    // Get the organ request details
    const requestResult = await pool.query(
      `SELECT or_req.*, p.full_name as patient_name, h.name as from_hospital_name
       FROM organ_requests or_req
       JOIN patients p ON or_req.patient_id = p.patient_id
       JOIN hospitals h ON or_req.from_hospital_id = h.hospital_id
       WHERE or_req.request_id = $1 AND or_req.to_hospital_id = $2`,
      [request_id, hospital_id],
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Request not found or not for your hospital",
      });
    }

    const request = requestResult.rows[0];
    const requestingHospitalId = request.from_hospital_id;

    // Update request status
    await pool.query(
      "UPDATE organ_requests SET status = $1, response_notes = $2, updated_at = NOW() WHERE request_id = $3",
      [response === "accept" ? "accepted" : "rejected", notes || null, request_id]
    );

    // Create notification for requesting hospital
    const notificationId = `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const title = response === "accept" ? "Request Accepted!" : "Request Declined";
    const message = response === "accept" 
      ? `Your organ request for ${request.patient_name} has been accepted. Please coordinate next steps.`
      : `Your organ request for ${request.patient_name} has been declined.${notes ? ' Reason: ' + notes : ''}`;

    await pool.query(
      `INSERT INTO notifications (
        notification_id, hospital_id, type, title, message, 
        related_id, metadata, is_read
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        notificationId,
        requestingHospitalId,
        "request_response",
        title,
        message,
        request_id,
        JSON.stringify({
          request_id,
          status: response === "accept" ? "accepted" : "rejected",
          response_notes: notes,
          responded_by: req.hospital?.hospital_name,
        }),
        false,
      ]
    );

    // Mark the original notification as read
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE related_id = $1 AND hospital_id = $2",
      [request_id, hospital_id],
    );

    res.json({
      success: true,
      message: `Match request ${response === "accept" ? "accepted" : "rejected"} successfully`,
    });
  } catch (error) {
    console.error("Respond to match error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to respond to match request",
    });
  }
});

// Send organ request to donor hospital
router.post("/send-request", authenticateHospital, async (req, res) => {
  try {
    const fromHospitalId = req.hospital?.hospital_id;
    const { donor_id, donor_hospital_id, patient_id, notes } = req.body;

    if (!donor_id || !donor_hospital_id || !patient_id) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: donor_id, donor_hospital_id, patient_id",
      });
    }

    // Verify patient belongs to requesting hospital
    const patientResult = await pool.query(
      "SELECT full_name, organ_needed, urgency_level FROM patients WHERE patient_id = $1 AND hospital_id = $2",
      [patient_id, fromHospitalId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found or doesn't belong to your hospital",
      });
    }

    const patient = patientResult.rows[0];

    // Get requesting hospital info
    const hospitalResult = await pool.query(
      "SELECT name FROM hospitals WHERE hospital_id = $1",
      [fromHospitalId]
    );

    const requestId = `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isSameHospital = fromHospitalId === donor_hospital_id;

    // Determine initial status: auto-accept if same hospital, pending otherwise
    const initialStatus = isSameHospital ? "accepted" : "pending";
    const autoAcceptNotes = isSameHospital 
      ? "Auto-accepted: Internal hospital match - donor and patient in same facility"
      : notes || null;

    // Create the request record
    await pool.query(
      `INSERT INTO organ_requests (
        request_id, from_hospital_id, to_hospital_id, patient_id, 
        donor_id, status, notes, response_notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        requestId, 
        fromHospitalId, 
        donor_hospital_id, 
        patient_id, 
        donor_id, 
        initialStatus, 
        notes || null,
        isSameHospital ? autoAcceptNotes : null
      ]
    );

    // Update patient status based on whether auto-accepted
    const patientStatus = isSameHospital ? 'Matched' : 'In Progress';
    await pool.query(
      `UPDATE patients 
       SET status = $1, 
           status_updated_at = CURRENT_TIMESTAMP,
           matched_donor_id = $2,
           matched_hospital_id = $3
       WHERE patient_id = $4`,
      [patientStatus, donor_id, donor_hospital_id, patient_id]
    );

    // If same hospital, also update donor status to Matched
    if (isSameHospital) {
      await pool.query(
        `UPDATE donors 
         SET status = 'Matched',
             status_updated_at = CURRENT_TIMESTAMP,
             matched_patient_id = $1
         WHERE donor_id = $2`,
        [patient_id, donor_id]
      );
    }

    // Create notification - different message for same hospital
    const notificationId = `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (isSameHospital) {
      // Internal match notification
      await pool.query(
        `INSERT INTO notifications (
          notification_id, hospital_id, type, title, message, 
          related_id, metadata, is_read
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          notificationId,
          fromHospitalId, // Same hospital gets the notification
          "internal_match",
          "✅ Internal Match Confirmed",
          `Internal match successful! Patient ${patient.full_name} matched with available donor for ${patient.organ_needed}. Both are in your facility - please coordinate internally.`,
          requestId,
          JSON.stringify({
            request_id: requestId,
            patient_name: patient.full_name,
            organ_needed: patient.organ_needed,
            urgency: patient.urgency_level,
            donor_id,
            match_type: 'internal',
            auto_accepted: true,
          }),
          false,
        ]
      );
    } else {
      // External request notification
      await pool.query(
        `INSERT INTO notifications (
          notification_id, hospital_id, type, title, message, 
          related_id, metadata, is_read
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          notificationId,
          donor_hospital_id,
          "organ_request",
          "New Organ Request",
          `${hospitalResult.rows[0]?.name || 'A hospital'} has requested a ${patient.organ_needed} for a ${patient.urgency_level.toLowerCase()} priority patient.`,
          requestId,
          JSON.stringify({
            request_id: requestId,
            patient_name: patient.full_name,
            organ_needed: patient.organ_needed,
            urgency: patient.urgency_level,
            from_hospital: hospitalResult.rows[0]?.name,
            donor_id,
          }),
          false,
        ]
      );
    }

    // Return appropriate message based on match type
    const successMessage = isSameHospital
      ? `✅ Internal match confirmed! Patient and donor are both in your facility. Patient and donor statuses updated to 'Matched'. Please coordinate internally.`
      : `Match request sent successfully! Patient status updated to 'In Progress'.`;

    res.json({
      success: true,
      request_id: requestId,
      message: successMessage,
      internal_match: isSameHospital,
      auto_accepted: isSameHospital,
      patient_status: patientStatus,
    });
  } catch (error) {
    console.error("Send request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send request",
    });
  }
});

// Accept or reject organ request
router.post("/requests/:request_id/respond", authenticateHospital, async (req, res) => {
  try {
    const hospitalId = req.hospital?.hospital_id;
    const { request_id } = req.params;
    const { status, response_notes } = req.body; // status: 'accepted' | 'rejected'

    if (!request_id || request_id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: "Request ID is required",
      });
    }

    if (!status || !["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Status must be 'accepted' or 'rejected'",
      });
    }

    // First, check if the request exists
    const requestCheck = await pool.query(
      `SELECT * FROM organ_requests WHERE request_id = $1`,
      [request_id]
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Request not found. It may have been deleted.",
      });
    }

    const basicRequest = requestCheck.rows[0];

    // Check if patient still exists
    const patientCheck = await pool.query(
      `SELECT patient_id, full_name FROM patients WHERE patient_id = $1`,
      [basicRequest.patient_id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient no longer exists. Request cannot be processed.",
      });
    }

    // Check if donor still exists
    const donorCheck = await pool.query(
      `SELECT donor_id, full_name FROM donors WHERE donor_id = $1`,
      [basicRequest.donor_id]
    );

    if (donorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Donor no longer exists. Request cannot be processed.",
      });
    }

    // Now get full request details with joins
    const requestResult = await pool.query(
      `SELECT or_req.*, p.full_name as patient_name, h.name as from_hospital_name
       FROM organ_requests or_req
       JOIN patients p ON or_req.patient_id = p.patient_id
       JOIN hospitals h ON or_req.from_hospital_id = h.hospital_id
       WHERE or_req.request_id = $1 AND or_req.to_hospital_id = $2`,
      [request_id, hospitalId]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Request not found or not for your hospital",
      });
    }

    const request = requestResult.rows[0];

    // Update request status
    await pool.query(
      "UPDATE organ_requests SET status = $1, response_notes = $2, updated_at = NOW() WHERE request_id = $3",
      [status, response_notes || null, request_id]
    );

    // If accepted, update patient and donor status to 'Matched'
    if (status === 'accepted') {
      await pool.query(
        `UPDATE patients 
         SET status = 'Matched', 
             status_updated_at = CURRENT_TIMESTAMP
         WHERE patient_id = $1`,
        [request.patient_id]
      );

      // Update donor status to 'Matched'
      await pool.query(
        `UPDATE donors 
         SET status = 'Matched', 
             status_updated_at = CURRENT_TIMESTAMP,
             matched_patient_id = $1,
             matched_hospital_id = $2
         WHERE donor_id = $3`,
        [request.patient_id, request.from_hospital_id, request.donor_id]
      );
    } else if (status === 'rejected') {
      // If rejected, set patient back to 'Waiting' to allow new matches
      await pool.query(
        `UPDATE patients 
         SET status = 'Waiting', 
             status_updated_at = CURRENT_TIMESTAMP,
             matched_donor_id = NULL,
             matched_hospital_id = NULL
         WHERE patient_id = $1`,
        [request.patient_id]
      );
    }

    // Create notification for requesting hospital
    const notificationId = `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const title = status === "accepted" ? "Request Accepted!" : "Request Declined";
    const message = status === "accepted" 
      ? `Your organ request for ${request.patient_name} has been accepted. Please coordinate next steps.`
      : `Your organ request for ${request.patient_name} has been declined.${response_notes ? ' Reason: ' + response_notes : ''}`;

    await pool.query(
      `INSERT INTO notifications (
        notification_id, hospital_id, type, title, message, 
        related_id, metadata, is_read
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        notificationId,
        request.from_hospital_id,
        "request_response",
        title,
        message,
        request_id,
        JSON.stringify({
          request_id,
          status,
          response_notes,
          responded_by: req.hospital?.hospital_name,
        }),
        false,
      ]
    );

    // Mark the original notification as read
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE related_id = $1 AND hospital_id = $2",
      [request_id, hospitalId]
    );

    res.json({
      success: true,
      message: `Request ${status} successfully`,
      status,
    });
  } catch (error) {
    console.error("Respond to request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to respond to request",
    });
  }
});

// Mark transplant as completed
router.post("/complete-transplant", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { patient_id, donor_id, notes } = req.body;

    if (!patient_id || !donor_id) {
      return res.status(400).json({
        success: false,
        error: "Patient ID and Donor ID are required",
      });
    }

    // Verify patient belongs to hospital and is in Matched status
    const patientResult = await pool.query(
      `SELECT * FROM patients 
       WHERE patient_id = $1 AND hospital_id = $2 AND status = 'Matched'`,
      [patient_id, hospital_id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found, doesn't belong to your hospital, or not in Matched status",
      });
    }

    // Update patient status to 'Completed'
    await pool.query(
      `UPDATE patients 
       SET status = 'Completed', 
           status_updated_at = CURRENT_TIMESTAMP,
           completed_at = CURRENT_TIMESTAMP
       WHERE patient_id = $1`,
      [patient_id]
    );

    // Update donor status to 'Donated'
    await pool.query(
      `UPDATE donors 
       SET status = 'Donated', 
           status_updated_at = CURRENT_TIMESTAMP,
           donated_at = CURRENT_TIMESTAMP
       WHERE donor_id = $1`,
      [donor_id]
    );

    // Update organ request to completed
    await pool.query(
      `UPDATE organ_requests 
       SET status = 'completed', 
           response_notes = $1,
           updated_at = NOW()
       WHERE patient_id = $2 AND donor_id = $3`,
      [notes || 'Transplant completed successfully', patient_id, donor_id]
    );

    res.json({
      success: true,
      message: "Transplant marked as completed successfully",
    });
  } catch (error) {
    console.error("Complete transplant error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark transplant as completed",
    });
  }
});

// Get match statistics
router.get("/stats", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    // Get outgoing requests stats
    const outgoingStats = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM matching_requests 
       WHERE requesting_hospital_id = $1 
       GROUP BY status`,
      [hospital_id],
    );

    // Get incoming requests stats
    const incomingStats = await pool.query(
      `SELECT COUNT(*) as total_incoming
       FROM notifications 
       WHERE hospital_id = $1 AND type = 'organ_match'`,
      [hospital_id],
    );

    res.json({
      success: true,
      stats: {
        outgoing: outgoingStats.rows,
        incoming: incomingStats.rows[0]?.total_incoming || 0,
      },
    });
  } catch (error) {
    console.error("Get match stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get match statistics",
    });
  }
});

// Mark received requests as viewed (when Received tab is opened)
router.post("/mark-received-viewed", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    // Mark all received requests (accepted/rejected) as viewed for this hospital
    await pool.query(
      `UPDATE organ_requests 
       SET is_viewed_by_donor_hospital = TRUE
       WHERE to_hospital_id = $1 
         AND status IN ('accepted', 'rejected')
         AND is_viewed_by_donor_hospital = FALSE`,
      [hospital_id],
    );

    res.json({
      success: true,
      message: "Received requests marked as viewed",
    });
  } catch (error) {
    console.error("Mark received viewed error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark received requests as viewed",
    });
  }
});

// Enhanced AI matching endpoint
router.post("/enhanced-matches", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { patient_id } = req.body;

    if (!patient_id) {
      return res.status(400).json({
        success: false,
        error: "Patient ID is required",
      });
    }

    // Verify patient belongs to this hospital and get patient for policy context
    // Only allow matching for active patients (not Completed)
    const patientResult = await pool.query(
      `SELECT * FROM patients 
       WHERE patient_id = $1 AND hospital_id = $2
         AND (status IS NULL OR status IN ('Waiting', 'In Progress', 'Matched'))`,
      [patient_id, hospital_id],
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found or doesn't belong to your hospital",
      });
    }
    const patient = patientResult.rows[0];

    // Compute matches first using core algorithm
    let enhancedMatches = await findEnhancedMatches(patient_id);

    // Try to find active policies for this organ
    let policyApplied = false;
    let policyTitle: string | null = null;
    let policyCount = 0;

    try {
      // Query active policies from database (excluding paused ones)
      const polRes = await pool.query(
        `SELECT policy_id, title, description, policy_content, created_at
         FROM policies
         WHERE status = 'active' AND (paused_for_matching = FALSE OR paused_for_matching IS NULL)
         ORDER BY created_at DESC`,
      );

      console.log(`Found ${polRes.rows.length} active policies`);
      const patientOrgan = String(patient.organ_needed || "").toLowerCase().trim();

      for (const row of polRes.rows) {
        let organMatch = false;
        
        // Extract organ type from title, description, or content
        // Policy titles usually contain organ name like "Kidney Allocation" or "Heart Transport"
        const textToSearch = (
          (row.title || '') + ' ' + 
          (row.description || '') + ' ' + 
          (row.policy_content || '')
        ).toLowerCase();
        
        // Check if patient's organ type is mentioned in the policy
        // Common organ types: kidney, heart, liver, lung, pancreas, intestine
        if (patientOrgan && textToSearch.includes(patientOrgan)) {
          organMatch = true;
        }

        if (organMatch) {
          policyCount++;
          if (!policyApplied) {
            // Apply first matching policy
            policyApplied = true;
            policyTitle = row.title;
            
            console.log(`Applying policy: ${row.title} for organ: ${patientOrgan}`);
            
            // Parse criteria weights if available
            let weights = {
              blood: 0.4,
              urgency: 0.3,
              distance: 0.2,
              time: 0.1,
            };
            
            if (row.criteria_weights) {
              try {
                const parsed = typeof row.criteria_weights === 'string' 
                  ? JSON.parse(row.criteria_weights)
                  : row.criteria_weights;
                  
                weights = {
                  blood: Number(parsed.blood_compatibility || parsed.blood || 0.4),
                  urgency: Number(parsed.urgency_level || parsed.urgency || 0.3),
                  distance: Number(parsed.geographical_distance || parsed.distance || 0.2),
                  time: Number(parsed.waiting_time || parsed.time || 0.1),
                };
              } catch (e) {
                console.log('Using default weights due to parse error:', e);
              }
            }

            // Recompute scores using policy weights
            enhancedMatches = enhancedMatches
              .map((m) => {
                const recomputed = Math.round(
                  m.compatibility_score * weights.blood +
                    m.urgency_bonus * weights.urgency +
                    m.distance_score * weights.distance +
                    (m.time_score || 100) * weights.time
                );
                
                let explanation = m.explanation || "";
                const policyNote = `Policy: ${policyTitle}${policyCount > 1 ? ` (+${policyCount - 1} more)` : ""}`;
                explanation = explanation
                  ? `${explanation}; ${policyNote}`
                  : policyNote;
                  
                return { ...m, match_score: recomputed, explanation };
              })
              .sort((a, b) => b.match_score - a.match_score);
          }
        }
      }
      
      if (policyCount > 0) {
        console.log(`Applied ${policyCount} active ${patientOrgan} policy/policies`);
      }
    } catch (err) {
      console.error('Policy application error:', err);
    }

    res.json({
      success: true,
      matches: enhancedMatches,
      total_matches: enhancedMatches.length,
      algorithm: "enhanced_ai_v2",
      policy_applied: policyApplied,
      policy_title: policyTitle,
    });
  } catch (error) {
    console.error("Enhanced AI matching error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to find enhanced matches",
    });
  }
});

// Predict transplant success
router.post("/predict-success", authenticateHospital, async (req, res) => {
  try {
    const { patient_id, donor_id } = req.body;

    if (!patient_id || !donor_id) {
      return res.status(400).json({
        success: false,
        error: "Patient ID and Donor ID are required",
      });
    }

    const prediction = await predictTransplantSuccess(patient_id, donor_id);

    res.json({
      success: true,
      prediction,
    });
  } catch (error) {
    console.error("Transplant success prediction error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to predict transplant success",
    });
  }
});

// Get matching insights for hospital
router.get("/insights", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    const insights = await generateMatchingInsights(hospital_id!);

    res.json({
      success: true,
      insights,
    });
  } catch (error) {
    console.error("Matching insights error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate matching insights",
    });
  }
});

export default router;
