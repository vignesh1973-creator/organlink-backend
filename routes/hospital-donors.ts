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

// Get all donors for a hospital
router.get("/", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;

    const result = await pool.query(
      `SELECT *, 
         created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as created_at_ist,
         registration_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as registration_date_ist
       FROM donors 
       WHERE hospital_id = $1 
       ORDER BY created_at DESC`,
      [hospital_id],
    );

    res.json({
      success: true,
      donors: result.rows,
    });
  } catch (error) {
    console.error("Error fetching donors:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch donors",
    });
  }
});

// Get single donor
router.get("/:donor_id", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { donor_id } = req.params;

    const result = await pool.query(
      "SELECT * FROM donors WHERE donor_id = $1 AND hospital_id = $2",
      [donor_id, hospital_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Donor not found",
      });
    }

    res.json({
      success: true,
      donor: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching donor:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch donor",
    });
  }
});

// Register new donor with signature verification and blockchain
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
      organs_to_donate,
      medical_history,
      contact_phone,
      contact_email,
      guardian_name,
      guardian_phone,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'Signature image is required' 
      });
    }

    console.log('Processing donor registration for:', full_name);
    
    // Parse organs_to_donate if it's a JSON string
    let parsedOrgans;
    try {
      parsedOrgans = typeof organs_to_donate === 'string' ? JSON.parse(organs_to_donate) : organs_to_donate;
    } catch (parseError) {
      console.error('Error parsing organs_to_donate:', parseError);
      return res.status(400).json({ 
        success: false,
        error: 'Invalid organs_to_donate format' 
      });
    }
    console.log('Parsed organs:', parsedOrgans);

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
        `signature-${full_name}-${Date.now()}.${req.file.mimetype.split('/')[1]}`,
        {
          hospitalId: hospital_id.toString(),
          donorName: full_name.toString(),
          uploadDate: new Date().toISOString(),
          ocrVerified: ocrResult.match.toString(),
          ocrConfidence: ocrResult.confidence.toString()
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

    // Step 4: Save to database (donor_id auto-generated) with retry logic
    let result;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`Attempting database insertion (attempt ${retryCount + 1}/${maxRetries})...`);
        result = await pool.query(
          `INSERT INTO donors (
            hospital_id, full_name, age, gender, blood_type,
            organs_to_donate, medical_history, contact_phone, 
            contact_email, guardian_name, guardian_phone, signature_ipfs_hash,
            blockchain_hash, signature_verified, ocr_confidence
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *`,
          [
            hospital_id,
            full_name,
            age,
            gender,
            blood_type,
            parsedOrgans,
            medical_history,
            contact_phone,
            contact_email,
            guardian_name,
            guardian_phone,
            ipfsCID,
            blockchainHash,
            ocrResult.match,
            ocrResult.confidence
          ]
        );
        console.log('✅ Database insertion successful!');
        break; // Success, exit retry loop
      } catch (dbError) {
        retryCount++;
        console.error(`❌ Database insertion failed (attempt ${retryCount}/${maxRetries}):`, dbError.message);
        
        if (retryCount >= maxRetries) {
          console.error('Max retries reached, giving up');
          throw dbError;
        }
        
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    res.json({
      success: true,
      message: "Donor registered successfully with blockchain verification",
      donor: result.rows[0],
      verification: {
        ocrVerified: ocrResult.match,
        confidence: ocrResult.confidence,
        ipfsCID,
        blockchainHash,
        signatureUrl: ipfsService.getFileUrl(ipfsCID)
      }
    });
  } catch (error) {
    console.error("Error registering donor:", error);
    res.status(500).json({
      success: false,
      error: "Failed to register donor",
    });
  }
});

// Update donor signature and blockchain info
router.post("/:donor_id/signature", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { donor_id } = req.params;
    const { signature_ipfs_hash, blockchain_hash, signature_verified } =
      req.body;

    const result = await pool.query(
      `UPDATE donors
       SET signature_ipfs_hash = $1, blockchain_hash = $2, signature_verified = $3
       WHERE donor_id = $4 AND hospital_id = $5
       RETURNING *`,
      [
        signature_ipfs_hash,
        blockchain_hash || null,
        signature_verified || false,
        donor_id,
        hospital_id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Donor not found",
      });
    }

    res.json({
      success: true,
      message: "Donor signature updated successfully",
      donor: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating donor signature:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update donor signature",
    });
  }
});

// Update donor status
router.patch("/:donor_id/status", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { donor_id } = req.params;
    const { is_active } = req.body;

    const result = await pool.query(
      `UPDATE donors 
       SET is_active = $1
       WHERE donor_id = $2 AND hospital_id = $3
       RETURNING *`,
      [is_active, donor_id, hospital_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Donor not found",
      });
    }

    res.json({
      success: true,
      message: "Donor status updated successfully",
      donor: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating donor status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update donor status",
    });
  }
});

// Delete donor
router.delete("/:donor_id", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { donor_id } = req.params;

    const result = await pool.query(
      "DELETE FROM donors WHERE donor_id = $1 AND hospital_id = $2 RETURNING *",
      [donor_id, hospital_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Donor not found",
      });
    }

    res.json({
      success: true,
      message: "Donor deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting donor:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete donor",
    });
  }
});

// Update donor
router.put("/:donor_id", authenticateHospital, async (req, res) => {
  try {
    const hospital_id = req.hospital?.hospital_id;
    const { donor_id } = req.params;
    const {
      full_name,
      age,
      gender,
      blood_type,
      organs_to_donate,
      medical_history,
      contact_phone,
      contact_email,
      guardian_name,
      guardian_phone,
    } = req.body;

    // Verify donor belongs to this hospital
    const donorCheck = await pool.query(
      "SELECT donor_id FROM donors WHERE donor_id = $1 AND hospital_id = $2",
      [donor_id, hospital_id],
    );

    if (donorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Donor not found or doesn't belong to your hospital",
      });
    }

    const result = await pool.query(
      `UPDATE donors SET
        full_name = $1, age = $2, gender = $3, blood_type = $4,
        organs_to_donate = $5, medical_history = $6, contact_phone = $7,
        contact_email = $8, guardian_name = $9, guardian_phone = $10
      WHERE donor_id = $11 AND hospital_id = $12
      RETURNING *`,
      [
        full_name,
        age,
        gender,
        blood_type,
        organs_to_donate,
        medical_history,
        contact_phone,
        contact_email,
        guardian_name,
        guardian_phone,
        donor_id,
        hospital_id,
      ],
    );

    res.json({
      success: true,
      message: "Donor updated successfully",
      donor: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating donor:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update donor",
    });
  }
});


export default router;
