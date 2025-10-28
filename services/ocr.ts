import Tesseract from "tesseract.js";
import sharp from "sharp";

export class OCRService {
  // Process image and extract text
  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    return this.extractText(imageBuffer);
  }

  // Process image and extract text
  async extractText(imageBuffer: Buffer): Promise<string> {
    try {
      // Preprocess image for better OCR results
      const processedImage = await this.preprocessImage(imageBuffer);

      // Perform OCR
      const result = await Tesseract.recognize(processedImage, "eng", {
        logger: (m) => console.log(m),
      });

      return result.data.text.trim();
    } catch (error) {
      console.error("OCR text extraction error:", error);
      throw new Error("Failed to extract text from image");
    }
  }

  // Preprocess image for better OCR accuracy (with optional rotation)
  private async preprocessImage(
    imageBuffer: Buffer,
    rotateDeg: number = 0,
  ): Promise<Buffer> {
    try {
      const img = sharp(imageBuffer);
      const meta = await img.metadata();
      const targetWidth = Math.max(meta.width || 0, 1600);
      return await img
        .rotate(rotateDeg)
        .resize({ width: targetWidth, withoutEnlargement: false })
        .greyscale()
        .normalize()
        .sharpen()
        .toFormat("png")
        .toBuffer();
    } catch (error) {
      console.error("Image preprocessing error:", error);
      return imageBuffer; // Return original if preprocessing fails
    }
  }

  // Verify signature document
  async verifySignatureDocument(imageBuffer: Buffer): Promise<{
    isValid: boolean;
    extractedText: string;
    confidence: number;
    keywords: string[];
  }> {
    try {
      // Extract text from the signature document
      const processed = await this.preprocessImage(imageBuffer);
      const result = await Tesseract.recognize(processed, "eng", {
        logger: (m) => console.log(m),
      });

      const extractedText = result.data.text.trim().toLowerCase();
      const confidence = result.data.confidence;

      // Keywords that might indicate a valid signature document
      const validKeywords = [
        "signature",
        "consent",
        "agreement",
        "donor",
        "patient",
        "organ",
        "authorization",
        "medical",
        "hospital",
        "date",
        "name",
        "signed",
      ];

      // Check for presence of keywords
      const foundKeywords = validKeywords.filter((keyword) =>
        extractedText.includes(keyword),
      );

      // Basic validation criteria
      const hasMinimumLength = extractedText.length > 10;
      const hasKeywords = foundKeywords.length >= 2;
      const hasGoodConfidence = confidence > 50;

      const isValid = hasMinimumLength && hasKeywords && hasGoodConfidence;

      return {
        isValid,
        extractedText: result.data.text.trim(),
        confidence,
        keywords: foundKeywords,
      };
    } catch (error) {
      console.error("Signature verification error:", error);
      return {
        isValid: false,
        extractedText: "",
        confidence: 0,
        keywords: [],
      };
    }
  }

  // Advanced signature verification with pattern matching
  async advancedSignatureVerification(
    imageBuffer: Buffer,
    expectedPatientName?: string,
  ): Promise<{
    isValid: boolean;
    extractedText: string;
    confidence: number;
    matchedPatterns: string[];
    nameMatch: boolean;
  }> {
    try {
      // Try multiple orientations (handles vertical signatures)
      const angles = [0, 90, 180, 270];
      let best = { text: "", confidence: 0 };
      for (const angle of angles) {
        const processed = await this.preprocessImage(imageBuffer, angle);
        const res = await Tesseract.recognize(processed, "eng", {
          logger: (m) => console.log(m),
        });
        const conf = Number(res.data.confidence || 0);
        if (conf > best.confidence)
          best = { text: res.data.text.trim(), confidence: conf };
      }

      const extractedText = best.text;
      const normalizedText = extractedText.toLowerCase();

      // Signature document patterns
      const patterns = [
        /consent.*organ.*donation/i,
        /authorization.*medical.*treatment/i,
        /patient.*signature/i,
        /donor.*agreement/i,
        /medical.*consent/i,
        /organ.*transplant.*consent/i,
        /signature.*date/i,
        /\d{1,2}\/\d{1,2}\/\d{2,4}/i, // Date patterns
        /signed.*by/i,
      ];

      const matchedPatterns = patterns
        .filter((pattern) => pattern.test(extractedText))
        .map((pattern) => pattern.toString());

      // Check if expected patient name is found (robust matching with typos)
      let nameMatch = false;
      if (expectedPatientName) {
        const sanitize = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const textSan = sanitize(normalizedText);
        const expSan = sanitize(expectedPatientName);

        // token presence
        const parts = expectedPatientName
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);
        const partsMatch =
          parts.filter((p) => p.length > 2 && textSan.includes(sanitize(p)))
            .length >= Math.min(2, parts.length);
        const wholeMatch = expSan.length > 3 && textSan.includes(expSan);

        // trigram similarity
        const trigrams = (s: string) => new Set(s.match(/.{1,3}/g) || []);
        const A = trigrams(expSan);
        const B = trigrams(textSan);
        const inter = [...A].filter((x) => B.has(x)).length;
        const sim = A.size ? inter / A.size : 0;

        // Levenshtein distance (allow small typos like Doe vs Dot)
        const levenshtein = (a: string, b: string) => {
          const m = a.length,
            n = b.length;
          const dp = Array.from({ length: m + 1 }, () =>
            new Array(n + 1).fill(0),
          );
          for (let i = 0; i <= m; i++) dp[i][0] = i;
          for (let j = 0; j <= n; j++) dp[0][j] = j;
          for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
              const cost = a[i - 1] === b[j - 1] ? 0 : 1;
              dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
              );
            }
          }
          return dp[m][n];
        };

        const tokens = Array.from(
          new Set(
            textSan
              .split(/\W+/)
              .filter((t) => t.length > 2)
              .slice(0, 10),
          ),
        );
        const nameTokens = Array.from(
          new Set(
            expSan
              .split(/\W+/)
              .filter((t) => t.length > 2),
          ),
        );
        const editDistMatch =
          nameTokens.some((nt) =>
            tokens.some((t) => levenshtein(nt, t) <= Math.ceil(nt.length * 0.2)),
          );

        nameMatch = partsMatch || wholeMatch || sim > 0.4 || editDistMatch;
      }

      const isValid =
        best.confidence > 50 &&
        extractedText.length > 10 &&
        (matchedPatterns.length > 0 || nameMatch);

      return {
        isValid,
        extractedText,
        confidence: best.confidence,
        matchedPatterns,
        nameMatch,
      };
    } catch (error) {
      console.error("Advanced signature verification error:", error);
      return {
        isValid: false,
        extractedText: "",
        confidence: 0,
        matchedPatterns: [],
        nameMatch: false,
      };
    }
  }

  // Enhanced signature name verification method (expected by backend)
  verifySignatureNameEnhanced(extractedText: string, formName: string): {
    match: boolean;
    confidence: number;
    extractedName: string;
    strategies: {
      exact: boolean;
      fuzzy: number;
      wordMatch: number;
      initials: boolean;
    };
  } {
    try {
      const cleanedExtracted = this.cleanName(extractedText);
      const cleanedForm = this.cleanName(formName);
      
      console.log('Comparing names:', { cleanedExtracted, cleanedForm });
      
      // Strategy 1: Exact match
      const exactMatch = cleanedExtracted === cleanedForm;
      
      // Strategy 2: Fuzzy match (Levenshtein)
      const fuzzyScore = this.calculateSimilarity(cleanedExtracted, cleanedForm);
      
      // Strategy 3: Word-by-word match
      const wordMatch = this.calculateWordMatch(cleanedExtracted, cleanedForm);
      
      // Strategy 4: Initials match
      const initialsMatch = this.checkInitials(cleanedExtracted, cleanedForm);
      
      // Calculate overall confidence
      let confidence = 0;
      if (exactMatch) confidence = 1.0;
      else if (fuzzyScore > 0.8) confidence = fuzzyScore;
      else if (wordMatch > 0.7) confidence = wordMatch;
      else if (initialsMatch) confidence = 0.6;
      else confidence = Math.max(fuzzyScore, wordMatch);
      
      const match = confidence >= 0.6;
      
      return {
        match,
        confidence: Math.round(confidence * 100),
        extractedName: cleanedExtracted,
        strategies: {
          exact: exactMatch,
          fuzzy: Math.round(fuzzyScore * 100),
          wordMatch: Math.round(wordMatch * 100),
          initials: initialsMatch
        }
      };
    } catch (error) {
      console.error('Name verification error:', error);
      return {
        match: false,
        confidence: 0,
        extractedName: extractedText,
        strategies: {
          exact: false,
          fuzzy: 0,
          wordMatch: 0,
          initials: false
        }
      };
    }
  }

  // Helper methods
  private cleanName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1.length === 0) return str2.length === 0 ? 1 : 0;
    if (str2.length === 0) return 0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null)
    );
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private calculateWordMatch(str1: string, str2: string): number {
    const words1 = str1.split(' ').filter(w => w.length > 0);
    const words2 = str2.split(' ').filter(w => w.length > 0);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matchedWords = 0;
    const totalWords = Math.max(words1.length, words2.length);
    
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (this.calculateSimilarity(word1, word2) > 0.8) {
          matchedWords++;
          break;
        }
      }
    }
    
    return matchedWords / totalWords;
  }

  private checkInitials(str1: string, str2: string): boolean {
    const getInitials = (name: string) => {
      return name.split(' ')
        .filter(word => word.length > 0)
        .map(word => word[0])
        .join('');
    };
    
    const initials1 = getInitials(str1);
    const initials2 = getInitials(str2);
    
    return initials1 === initials2 && initials1.length >= 2;
  }
}

export const ocrService = new OCRService();
