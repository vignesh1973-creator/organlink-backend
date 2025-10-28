import express from "express";
import multer from "multer";
import { pool } from "../config/database.js";
import { authenticateHospital } from "../middleware/auth.js";
import { blockchainService } from "../services/blockchain";
import { ipfsService } from "../services/ipfs";
import { ocrService } from "../services/ocr";

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Get all patients for a hospital
router.get("/", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    const result = await pool.query(
      `SELECT *, 
         created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as created_at_ist,
         registration_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as registration_date_ist
       FROM patients 
       WHERE hospital_id = $1 
       ORDER BY created_at DESC`,
      [hospital_id],
    );

    res.json({
      success: true,
      patients: result.rows,
    });
  } catch (error) {
    console.error("Error fetching patients:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch patients",
    });
  }
});

// Get single patient
router.get("/:patient_id", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { patient_id } = req.params;

    const result = await pool.query(
      "SELECT * FROM patients WHERE patient_id = $1 AND hospital_id = $2",
      [patient_id, hospital_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found",
      });
    }

    res.json({
      success: true,
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching patient:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch patient",
    });
  }
});

// Register new patient with signature verification and blockchain
router.post("/register", upload.single('signature'), authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const hospital_name = req.hospital?.hospital_name || 'Unknown Hospital';
    const {
      full_name,
      age,
      gender,
      blood_type,
      date_of_birth,
      national_id,
      organ_needed,
      urgency_level,
      medical_condition,
      contact_phone,
      contact_email,
      guardian_name,
      guardian_phone,
      doctor_notes
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'Signature image is required' 
      });
    }

    console.log('Processing patient registration for:', full_name);

    // Step 1: OCR Signature Verification
    let ocrResult;
    try {
      console.log('Starting OCR verification...');
      const extractedText = await ocrService.extractTextFromImage(req.file.buffer);
      ocrResult = ocrService.verifySignatureNameEnhanced(extractedText, full_name);
      
      console.log('OCR verification result:', ocrResult);
      
      if (!ocrResult.match) {
        return res.status(400).json({
          success: false,
          error: 'Signature verification failed',
          details: {
            extractedName: ocrResult.extractedName,
            confidence: ocrResult.confidence,
            strategies: ocrResult.strategies
          }
        });
      }
    } catch (ocrError) {
      console.error('OCR verification failed:', ocrError);
      // In development, allow bypass for demo purposes
      if (process.env.NODE_ENV === 'development') {
        console.warn('OCR bypass enabled for development');
        ocrResult = { match: true, confidence: 80, extractedName: full_name };
      } else {
        return res.status(500).json({ 
          success: false, 
          error: 'Signature verification service unavailable' 
        });
      }
    }

    // Step 2: Upload signature to IPFS
    let ipfsCID;
    try {
      console.log('Uploading signature to IPFS...');
      ipfsCID = await ipfsService.pinFile(
        req.file.buffer,
        `patient-signature-${full_name}-${Date.now()}.${req.file.mimetype.split('/')[1]}`,
        {
          hospitalId: hospital_id.toString(),
          patientName: full_name.toString(),
          uploadDate: new Date().toISOString(),
          ocrVerified: ocrResult.match.toString(),
          ocrConfidence: ocrResult.confidence.toString(),
          type: 'patient'
        }
      );
      console.log('Signature uploaded to IPFS:', ipfsCID);
    } catch (ipfsError) {
      console.error('IPFS upload failed:', ipfsError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to upload signature to IPFS' 
      });
    }

    // Step 3: Generate patient hash and record on blockchain
    let blockchainHash;
    try {
      console.log('Recording on blockchain...');
      const patientHash = blockchainService.generatePatientHash(
        full_name, 
        date_of_birth, 
        national_id, 
        blood_type
      );
      blockchainHash = await blockchainService.addVerifiedRecord(
        patientHash, 
        hospital_name, 
        ipfsCID
      );
      console.log('Blockchain record created:', blockchainHash);
    } catch (blockchainError) {
      console.error('Blockchain recording failed:', blockchainError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to record on blockchain' 
      });
    }

    // Step 4: Save to database (patient_id auto-generated, status defaults to 'Waiting')
    const result = await pool.query(
      `INSERT INTO patients (
        hospital_id, full_name, age, gender, blood_type,
        organ_needed, urgency_level, medical_condition, contact_phone,
        contact_email, guardian_name, guardian_phone,
        signature_ipfs_hash, blockchain_hash, signature_verified, ocr_confidence,
        status, status_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        hospital_id,
        full_name,
        age,
        gender,
        blood_type,
        organ_needed,
        urgency_level,
        medical_condition,
        contact_phone,
        contact_email,
        guardian_name,
        guardian_phone,
        ipfsCID,
        blockchainHash,
        ocrResult.match,
        ocrResult.confidence,
        'Waiting'
      ],
    );

    res.json({
      success: true,
      message: "Patient registered successfully with blockchain verification",
      patient: result.rows[0],
      verification: {
        ocrVerified: ocrResult.match,
        confidence: ocrResult.confidence,
        ipfsCID,
        blockchainHash,
        signatureUrl: ipfsService.getFileUrl(ipfsCID)
      }
    });
  } catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({
      success: false,
      error: "Failed to register patient",
    });
  }
});

// Update patient signature and blockchain info
router.post(
  "/:patient_id/signature",
  authenticateHospital,
  async (req, res) => {
    try {
      const hospital_id = req.hospital?.hospital_id;
      const { patient_id } = req.params;
      const { signature_ipfs_hash, blockchain_hash, signature_verified } =
        req.body;

      const result = await pool.query(
        `UPDATE patients
       SET signature_ipfs_hash = $1, blockchain_hash = $2, signature_verified = $3
       WHERE patient_id = $4 AND hospital_id = $5
       RETURNING *`,
        [
          signature_ipfs_hash,
          blockchain_hash || null,
          signature_verified || false,
          patient_id,
          hospital_id,
        ],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Patient not found",
        });
      }

      res.json({
        success: true,
        message: "Patient signature updated successfully",
        patient: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating patient signature:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update patient signature",
      });
    }
  },
);

// Update patient active status
router.patch("/:patient_id/status", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { patient_id } = req.params;
    const { is_active } = req.body;

    const result = await pool.query(
      `UPDATE patients 
       SET is_active = $1
       WHERE patient_id = $2 AND hospital_id = $3
       RETURNING *`,
      [is_active, patient_id, hospital_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found",
      });
    }

    res.json({
      success: true,
      message: "Patient status updated successfully",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating patient status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update patient status",
    });
  }
});

// Mark transplant as completed
router.patch("/:patient_id/complete-transplant", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { patient_id } = req.params;
    const { completion_notes } = req.body;

    // Verify patient belongs to this hospital and is in 'Matched' status
    const patientResult = await pool.query(
      "SELECT patient_id, status, full_name FROM patients WHERE patient_id = $1 AND hospital_id = $2",
      [patient_id, hospital_id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found or doesn't belong to your hospital",
      });
    }

    const patient = patientResult.rows[0];
    if (patient.status !== 'Matched') {
      return res.status(400).json({
        success: false,
        error: `Cannot complete transplant. Patient status is '${patient.status}' but should be 'Matched'.`,
      });
    }

    // Update patient status to 'Completed'
    const result = await pool.query(
      `UPDATE patients 
       SET status = 'Completed', 
           status_updated_at = CURRENT_TIMESTAMP,
           completed_at = CURRENT_TIMESTAMP,
           doctor_notes = COALESCE(doctor_notes, '') || $1
       WHERE patient_id = $2 AND hospital_id = $3
       RETURNING *`,
      [completion_notes ? `\n\nTransplant completed: ${completion_notes}` : '\n\nTransplant completed successfully.', patient_id, hospital_id]
    );

    res.json({
      success: true,
      message: `Transplant completed successfully for ${patient.full_name}`,
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error completing transplant:", error);
    res.status(500).json({
      success: false,
      error: "Failed to complete transplant",
    });
  }
});

// Update patient
router.put("/:patient_id", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { patient_id } = req.params;
    const {
      full_name,
      age,
      gender,
      blood_type,
      organ_needed,
      urgency_level,
      medical_condition,
      contact_phone,
      contact_email,
      guardian_name,
      guardian_phone,
    } = req.body;

    // Verify patient belongs to this hospital
    const patientCheck = await pool.query(
      "SELECT patient_id FROM patients WHERE patient_id = $1 AND hospital_id = $2",
      [patient_id, hospital_id],
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found or doesn't belong to your hospital",
      });
    }

    const result = await pool.query(
      `UPDATE patients SET
        full_name = $1, age = $2, gender = $3, blood_type = $4,
        organ_needed = $5, urgency_level = $6, medical_condition = $7,
        contact_phone = $8, contact_email = $9, guardian_name = $10,
        guardian_phone = $11
      WHERE patient_id = $12 AND hospital_id = $13
      RETURNING *`,
      [
        full_name,
        age,
        gender,
        blood_type,
        organ_needed,
        urgency_level,
        medical_condition,
        contact_phone,
        contact_email,
        guardian_name,
        guardian_phone,
        patient_id,
        hospital_id,
      ],
    );

    res.json({
      success: true,
      message: "Patient updated successfully",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating patient:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update patient",
    });
  }
});

// Delete patient
router.delete("/:patient_id", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { patient_id } = req.params;

    // Verify patient belongs to this hospital
    const patientCheck = await pool.query(
      "SELECT patient_id FROM patients WHERE patient_id = $1 AND hospital_id = $2",
      [patient_id, hospital_id],
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Patient not found or doesn't belong to your hospital",
      });
    }

    // Delete the patient
    await pool.query(
      "DELETE FROM patients WHERE patient_id = $1 AND hospital_id = $2",
      [patient_id, hospital_id],
    );

    res.json({
      success: true,
      message: "Patient deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting patient:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete patient",
    });
  }
});

export default router;
