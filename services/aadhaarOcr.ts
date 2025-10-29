import Tesseract from "tesseract.js";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

interface AadhaarData {
  name: string;
  dateOfBirth: string;
  gender: string;
  aadhaarNumber: string; // Partially masked
  photoBase64?: string; // Extracted profile photo
}

export class AadhaarOCRService {
  /**
   * Extract data from Aadhaar card (supports both color and B&W)
   * Works with both front and back of Aadhaar
   */
  async extractAadhaarData(imageBuffer: Buffer): Promise<{
    success: boolean;
    data?: AadhaarData;
    rawText: string;
    confidence: number;
    error?: string;
  }> {
    try {
      // Preprocess the Aadhaar image
      const processedImage = await this.preprocessAadhaarImage(imageBuffer);

      // Perform OCR with improved settings
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ./-',
        tessedit_pageseg_mode: '6', // Assume a single uniform block of text
      });
      const result = await worker.recognize(processedImage);
      await worker.terminate();

      const rawText = result.data.text;
      const confidence = result.data.confidence;

      console.log("Aadhaar OCR Raw Text:", rawText);
      console.log("Confidence:", confidence);

      // Extract structured data from raw text
      const extractedData = this.parseAadhaarText(rawText);

      if (!extractedData.name) {
        return {
          success: false,
          rawText,
          confidence,
          error: "Could not extract name from Aadhaar card",
        };
      }

      // Extract profile photo if available
      const photoBase64 = await this.extractProfilePhoto(imageBuffer);
      if (photoBase64) {
        extractedData.photoBase64 = photoBase64;
      }

      return {
        success: true,
        data: extractedData,
        rawText,
        confidence,
      };
    } catch (error) {
      console.error("Aadhaar OCR extraction error:", error);
      return {
        success: false,
        rawText: "",
        confidence: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Preprocess Aadhaar image for better OCR (handles both color and B&W)
   */
  private async preprocessAadhaarImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();

      // Determine if image needs rotation (portrait vs landscape)
      const needsRotation =
        metadata.width && metadata.height && metadata.width < metadata.height;

      return await image
        .rotate(needsRotation ? 90 : 0)
        .resize({ width: 3000, withoutEnlargement: false }) // Even larger for better text recognition
        .greyscale() // Convert to grayscale for consistent processing
        .normalize() // Normalize contrast
        .linear(1.5, -(128 * 1.5) + 128) // Increase contrast
        .sharpen({ sigma: 2 }) // Stronger sharpening
        .median(3) // Reduce noise
        .toFormat("png")
        .toBuffer();
    } catch (error) {
      console.error("Aadhaar image preprocessing error:", error);
      return imageBuffer; // Return original if preprocessing fails
    }
  }

  /**
   * Parse extracted text to identify Aadhaar fields
   */
  private parseAadhaarText(rawText: string): AadhaarData {
    const data: AadhaarData = {
      name: "",
      dateOfBirth: "",
      gender: "",
      aadhaarNumber: "",
    };

    const lines = rawText.split("\n").map((line) => line.trim());

    // Extract name (usually appears after specific keywords or at the top)
    const namePatterns = [
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i, // Full name pattern
      /(?:Name|name|NAME)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    ];

    for (const line of lines) {
      for (const pattern of namePatterns) {
        const match = line.match(pattern);
        if (match && match[1] && match[1].length > 3) {
          data.name = this.cleanName(match[1]);
          if (data.name) break;
        }
      }
      if (data.name) break;
    }

    // If name not found with patterns, try to extract from known Aadhaar structure
    // In Indian Aadhaar, name typically appears before DOB
    if (!data.name) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Name is usually a line with 2-4 words, all capitalized or title case
        if (
          /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line) &&
          line.length > 5 &&
          line.length < 50
        ) {
          data.name = this.cleanName(line);
          break;
        }
      }
    }

    // Extract Date of Birth (DOB / YOB)
    const dobPatterns = [
      /(?:DOB|D\.O\.B|Date of Birth|YOB|Year of Birth)[\s:]*(\d{2}[-\/]\d{2}[-\/]\d{4})/i,
      /(?:DOB|D\.O\.B|Date of Birth|YOB|Year of Birth)[\s:]*(\d{4})/i, // Just year
      /(\d{2}[-\/]\d{2}[-\/]\d{4})/, // Standalone date
    ];

    for (const line of lines) {
      for (const pattern of dobPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          data.dateOfBirth = match[1];
          break;
        }
      }
      if (data.dateOfBirth) break;
    }

    // Extract Gender
    const genderPatterns = [
      /(?:Gender|Sex|Male|Female|MALE|FEMALE|Male\/Female)[\s:]*([MFO]|Male|Female|Other|MALE|FEMALE)/i,
      /\b(Male|Female|MALE|FEMALE)\b/i,
    ];

    for (const line of lines) {
      for (const pattern of genderPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const gender = match[1].toLowerCase();
          if (gender.startsWith("m")) data.gender = "Male";
          else if (gender.startsWith("f")) data.gender = "Female";
          else data.gender = "Other";
          break;
        }
      }
      if (data.gender) break;
    }

    // Extract Aadhaar number (masked)
    const aadhaarPatterns = [
      /(\d{4}\s*\d{4}\s*\d{4})/i, // Full pattern
      /(\*{4}\s*\*{4}\s*\d{4})/i, // Masked pattern (only last 4 digits visible)
      /(\d{4})/g, // Just last 4 digits
    ];

    for (const line of lines) {
      for (const pattern of aadhaarPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          data.aadhaarNumber = `XXXX XXXX ${match[1].slice(-4)}`; // Store only last 4 digits
          break;
        }
      }
      if (data.aadhaarNumber) break;
    }

    return data;
  }

  /**
   * Extract profile photo from Aadhaar card
   * Photos are typically on the left side of the card
   */
  private async extractProfilePhoto(
    imageBuffer: Buffer
  ): Promise<string | null> {
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) return null;

      // Aadhaar photo is typically in the left portion (first 25-30% width)
      const photoWidth = Math.floor(metadata.width * 0.3);
      const photoHeight = Math.floor(metadata.height * 0.5);

      // Extract the photo region
      const photoBuffer = await image
        .extract({
          left: 10,
          top: Math.floor(metadata.height * 0.2),
          width: photoWidth,
          height: photoHeight,
        })
        .resize(150, 150, { fit: "cover" })
        .toFormat("jpeg", { quality: 80 })
        .toBuffer();

      // Convert to base64
      return `data:image/jpeg;base64,${photoBuffer.toString("base64")}`;
    } catch (error) {
      console.error("Photo extraction error:", error);
      return null;
    }
  }

  /**
   * Clean and normalize extracted name
   */
  private cleanName(name: string): string {
    return name
      .trim()
      .replace(/[^a-zA-Z\s]/g, "") // Remove special characters and numbers
      .replace(/\s+/g, " ") // Replace multiple spaces
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  /**
   * Verify if extracted Aadhaar name matches form name
   */
  verifyNameMatch(
    aadhaarName: string,
    formName: string
  ): {
    match: boolean;
    confidence: number;
    similarity: number;
  } {
    const cleanAadhaar = this.cleanName(aadhaarName).toLowerCase();
    const cleanForm = this.cleanName(formName).toLowerCase();

    // Exact match
    if (cleanAadhaar === cleanForm) {
      return { match: true, confidence: 100, similarity: 1.0 };
    }

    // Calculate similarity using Levenshtein distance
    const similarity = this.calculateSimilarity(cleanAadhaar, cleanForm);

    // Check word-by-word match (handles name order differences)
    const aadhaarWords = cleanAadhaar.split(" ");
    const formWords = cleanForm.split(" ");
    const commonWords = aadhaarWords.filter((word) =>
      formWords.includes(word)
    ).length;
    const wordMatchRatio =
      commonWords / Math.max(aadhaarWords.length, formWords.length);

    // Combined confidence
    const confidence =
      Math.round((similarity * 0.6 + wordMatchRatio * 0.4) * 100);

    return {
      match: confidence >= 70, // 70% threshold for match
      confidence,
      similarity,
    };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}

export const aadhaarOCRService = new AadhaarOCRService();
