import { pool } from "../config/database.js";
import { ipfsService } from "./ipfs.js";
import { blockchainPolicyService } from "./blockchainPolicyService.js";
interface MatchingCriteria {
  organ_type: string;
  blood_type: string;
  urgency_level: string;
  hospital_id: string;
  patient_id: string;
}

interface DonorMatch {
  donor_id: string;
  donor_name: string;
  blood_type: string;
  organs_available: string[];
  hospital_id: string;
  hospital_name: string;
  city?: string;
  state?: string;
  match_score: number;
  distance_score: number;
  compatibility_score: number;
  urgency_bonus: number;
  registration_time: string;
  policy_applied?: boolean;
  policy_name?: string;
  blockchain_verified?: boolean;
  explanation?: string;
}

interface MatchingResult {
  patient_id: string;
  matches: DonorMatch[];
  total_matches: number;
  best_match?: DonorMatch;
  blockchain_policies_applied?: boolean;
  applied_policies?: string[];
}

export class AIMatchingService {
  // Blood type compatibility matrix
  private bloodCompatibility = {
    "A+": ["A+", "AB+"],
    "A-": ["A+", "A-", "AB+", "AB-"],
    "B+": ["B+", "AB+"],
    "B-": ["B+", "B-", "AB+", "AB-"],
    "AB+": ["AB+"],
    "AB-": ["AB+", "AB-"],
    "O+": ["A+", "B+", "AB+", "O+"],
    "O-": ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  };

  // Urgency level scoring
  private urgencyScores = {
    Critical: 100,
    High: 75,
    Medium: 50,
    Low: 25,
  };

  // Find matches for a patient
  async findMatches(criteria: MatchingCriteria): Promise<MatchingResult> {
    try {
      // Get compatible blood types
      const compatibleBloodTypes =
        this.bloodCompatibility[
          criteria.blood_type as keyof typeof this.bloodCompatibility
        ] || [];

      if (compatibleBloodTypes.length === 0) {
        return {
          patient_id: criteria.patient_id,
          matches: [],
          total_matches: 0,
        };
      }

      // Get patient hospital info for distance calculation
      const patientHospitalResult = await pool.query(
        "SELECT city, state, country FROM hospitals WHERE hospital_id = $1",
        [criteria.hospital_id]
      );
      const patientHospital = patientHospitalResult.rows[0];

      // Find potential donors (exclude matched/donated donors)
      const donorsQuery = `
        SELECT 
          d.donor_id,
          d.full_name as donor_name,
          d.blood_type,
          d.organs_to_donate,
          d.hospital_id,
          h.name as hospital_name,
          h.city,
          h.state,
          h.country,
          d.registration_date,
          d.created_at
        FROM donors d
        JOIN hospitals h ON d.hospital_id = h.hospital_id
        WHERE d.blood_type = ANY($1)
          AND d.is_active = true
          AND $2 = ANY(d.organs_to_donate)
          AND d.hospital_id != $3
          AND (d.status IS NULL OR d.status = 'Available')
        ORDER BY d.created_at DESC
      `;

      const donorsResult = await pool.query(donorsQuery, [
        compatibleBloodTypes,
        criteria.organ_type,
        criteria.hospital_id,
      ]);

      // Calculate match scores for each donor
      const matches: DonorMatch[] = donorsResult.rows.map((donor) => {
        const compatibilityScore = this.calculateCompatibilityScore(
          criteria.blood_type,
          donor.blood_type,
        );

        const urgencyBonus =
          this.urgencyScores[
            criteria.urgency_level as keyof typeof this.urgencyScores
          ] || 0;

        const distanceResult = this.calculateDistanceScore(
          patientHospital,
          { city: donor.city, state: donor.state, country: donor.country },
        );

        const timeScore = this.calculateTimeScore(donor.registration_date);

        // Overall match score calculation with weights
        const matchScore =
          compatibilityScore * 0.4 +
          urgencyBonus * 0.3 +
          distanceResult.score * 0.2 +
          timeScore * 0.1;

        // Build human-readable explanation
        let explanation = `Blood compatibility: ${compatibilityScore}% | `;
        explanation += `Distance: ${distanceResult.category} (${distanceResult.score}%) | `;
        explanation += `Urgency priority: ${urgencyBonus}% | `;
        explanation += `Availability score: ${timeScore}%`;

        return {
          donor_id: donor.donor_id,
          donor_name: donor.donor_name,
          blood_type: donor.blood_type,
          organs_available: donor.organs_to_donate,
          hospital_id: donor.hospital_id,
          hospital_name: donor.hospital_name,
          city: donor.city,
          state: donor.state,
          match_score: Math.round(matchScore * 100) / 100,
          distance_score: distanceResult.score,
          compatibility_score: compatibilityScore,
          urgency_bonus: urgencyBonus,
          registration_time: donor.registration_date,
          explanation: distanceResult.explanation,
        };
      });

      // Sort by match score (highest first)
      matches.sort((a, b) => b.match_score - a.match_score);

      // Apply blockchain policies if available
      let finalMatches = matches;
      try {
        // Get patient details for policy application
        const patientResult = await pool.query(
          "SELECT * FROM patients WHERE patient_id = $1",
          [criteria.patient_id]
        );
        
        if (patientResult.rows.length > 0) {
          const patient = patientResult.rows[0];
          finalMatches = await this.applyBlockchainPolicies(matches, patient);
        }
      } catch (error) {
        console.error('Error applying blockchain policies:', error);
        // Continue with original matches if policy application fails
      }

      const appliedPolicies = finalMatches
        .filter(m => m.policy_applied && m.policy_name)
        .map(m => m.policy_name!)
        .filter((policy, index, arr) => arr.indexOf(policy) === index); // Remove duplicates

      return {
        patient_id: criteria.patient_id,
        matches: finalMatches,
        total_matches: finalMatches.length,
        best_match: finalMatches.length > 0 ? finalMatches[0] : undefined,
        blockchain_policies_applied: finalMatches.some(m => m.policy_applied),
        applied_policies: appliedPolicies,
      };
    } catch (error) {
      console.error("AI Matching error:", error);
      throw new Error("Failed to find matches");
    }
  }

  // Calculate blood type compatibility score
  private calculateCompatibilityScore(
    patientBloodType: string,
    donorBloodType: string,
  ): number {
    // Perfect match (same blood type)
    if (patientBloodType === donorBloodType) {
      return 100;
    }

    // Compatible but not perfect match
    const compatible =
      this.bloodCompatibility[
        donorBloodType as keyof typeof this.bloodCompatibility
      ] || [];
    if (compatible.includes(patientBloodType)) {
      return 80;
    }

    // Not compatible
    return 0;
  }

  // Calculate distance score based on city/state proximity
  // Returns both the score and a human-readable explanation
  private calculateDistanceScore(
    patientLocation: { city?: string; state?: string; country?: string },
    donorLocation: { city?: string; state?: string; country?: string },
  ): { score: number; category: string; explanation: string } {
    // Normalize locations to lowercase for comparison
    const pCity = (patientLocation.city || '').toLowerCase().trim();
    const pState = (patientLocation.state || '').toLowerCase().trim();
    const pCountry = (patientLocation.country || '').toLowerCase().trim();
    
    const dCity = (donorLocation.city || '').toLowerCase().trim();
    const dState = (donorLocation.state || '').toLowerCase().trim();
    const dCountry = (donorLocation.country || '').toLowerCase().trim();

    // Same city = highest score (local match)
    if (pCity && dCity && pCity === dCity) {
      return {
        score: 100,
        category: 'Local',
        explanation: `Donor is in the same city (${donorLocation.city}) - Fastest transport time`,
      };
    }

    // Same state, different city = high score (regional match)
    if (pState && dState && pState === dState) {
      return {
        score: 75,
        category: 'Regional',
        explanation: `Donor is in same state (${donorLocation.state}) - Within state transport`,
      };
    }

    // Same country, different state = medium score (national match)
    if (pCountry && dCountry && pCountry === dCountry) {
      return {
        score: 50,
        category: 'National',
        explanation: `Donor is in different state (${donorLocation.state || 'Unknown'}) - Interstate transport needed`,
      };
    }

    // Different country = lower score (international match)
    return {
      score: 30,
      category: 'International',
      explanation: `Donor is in different country (${donorLocation.country || 'Unknown'}) - International coordination required`,
    };
  }

  // Calculate time score (how long the donor has been registered)
  private calculateTimeScore(registrationDate: string): number {
    const now = new Date();
    const regDate = new Date(registrationDate);
    const daysDiff = Math.floor(
      (now.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Newer registrations get higher scores (more likely to be available)
    if (daysDiff <= 7) return 100;
    if (daysDiff <= 30) return 80;
    if (daysDiff <= 90) return 60;
    if (daysDiff <= 180) return 40;
    return 20;
  }

  // Create a matching request
  async createMatchingRequest(criteria: MatchingCriteria): Promise<string> {
    try {
      const requestId = `MATCH_REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Find matches first
      const matchingResult = await this.findMatches(criteria);

      // Store the matching request
      await pool.query(
        `INSERT INTO matching_requests (
          request_id, patient_id, requesting_hospital_id, organ_type, 
          blood_type, urgency_level, ai_score, status, match_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          requestId,
          criteria.patient_id,
          criteria.hospital_id,
          criteria.organ_type,
          criteria.blood_type,
          criteria.urgency_level,
          matchingResult.best_match?.match_score || 0,
          matchingResult.total_matches > 0 ? "matched" : "no_matches",
          JSON.stringify(matchingResult),
        ],
      );

      // If matches found, create notifications for donor hospitals
      if (matchingResult.total_matches > 0) {
        await this.createMatchNotifications(requestId, matchingResult);
      }

      return requestId;
    } catch (error) {
      console.error("Create matching request error:", error);
      throw new Error("Failed to create matching request");
    }
  }

  // Create notifications for hospitals with matching donors
  private async createMatchNotifications(
    requestId: string,
    matchingResult: MatchingResult,
  ) {
    try {
      // Group matches by hospital
      const hospitalMatches = new Map<string, DonorMatch[]>();
      matchingResult.matches.forEach((match) => {
        if (!hospitalMatches.has(match.hospital_id)) {
          hospitalMatches.set(match.hospital_id, []);
        }
        hospitalMatches.get(match.hospital_id)!.push(match);
      });

      // Create notification for each hospital
      for (const [hospitalId, matches] of hospitalMatches) {
        const notificationId = `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await pool.query(
          `INSERT INTO notifications (
            notification_id, hospital_id, type, title, message, 
            related_id, metadata, is_read
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            notificationId,
            hospitalId,
            "organ_match",
            "Organ Match Found",
            `Your hospital has ${matches.length} potential donor(s) for a patient in need. Please review the matching request.`,
            requestId,
            JSON.stringify({
              matches: matches,
              patient_id: matchingResult.patient_id,
              request_id: requestId,
            }),
            false,
          ],
        );
      }
    } catch (error) {
      console.error("Create match notifications error:", error);
    }
  }

  // Get matching requests for a hospital
  async getMatchingRequests(hospitalId: string): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT mr.*, p.full_name as patient_name, h.hospital_name as requesting_hospital_name
         FROM matching_requests mr
         LEFT JOIN patients p ON mr.patient_id = p.patient_id
         LEFT JOIN hospitals h ON mr.requesting_hospital_id = h.hospital_id
         WHERE mr.requesting_hospital_id = $1
         ORDER BY mr.created_at DESC`,
        [hospitalId],
      );

      return result.rows;
    } catch (error) {
      console.error("Get matching requests error:", error);
      throw new Error("Failed to get matching requests");
    }
  }

  // Apply active policies to matches (from database)
  async applyBlockchainPolicies(matches: any[], patient: any) {
    try {
      // Query approved policies from database
      // A policy is considered "approved" if it has > 50% yes votes
      // Exclude withdrawn and suspended policies
      const policiesResult = await pool.query(
        `SELECT p.policy_id, p.title, p.policy_content, p.description,
                p.votes_for, p.votes_against, p.total_votes
         FROM policies p
         WHERE p.status = 'voting' 
           AND p.total_votes > 0
           AND (CAST(p.votes_for AS FLOAT) / CAST(p.total_votes AS FLOAT)) > 0.5
           AND (p.is_withdrawn IS NULL OR p.is_withdrawn = false)
           AND (p.is_suspended IS NULL OR p.is_suspended = false)
         ORDER BY p.created_at DESC`
      );

      const approvedPolicies = policiesResult.rows;
      console.log(`📋 Found ${approvedPolicies.length} approved policies to apply`);

      // Apply each approved policy
      for (const policy of approvedPolicies) {
        const policyTitle = policy.title.toLowerCase();
        const policyContent = (policy.policy_content || '').toLowerCase();
        
        // Kidney Transport Priority Policy
        if ((policyTitle.includes('kidney') && policyTitle.includes('transport')) ||
            (policyTitle.includes('kidney') && policyTitle.includes('priority')) ||
            policyContent.includes('geographically closer')) {
          
          if (patient.organ_needed?.toLowerCase() === 'kidney') {
            console.log(`🏛️ Applying ${policy.title}`);
            
            // Get patient hospital details for distance calculation
            const patientHospitalResult = await pool.query(
              "SELECT city, state FROM hospitals WHERE hospital_id = $1",
              [patient.hospital_id]
            );
            
            const patientCity = patientHospitalResult.rows[0]?.city || '';
            
            matches.forEach(match => {
              let distanceBonus = 0;
              let explanation = '';
              
              // Same city gets maximum bonus
              if (match.city && patientCity && 
                  match.city.toLowerCase() === patientCity.toLowerCase()) {
                distanceBonus = 15;
                explanation = `Same city priority (${match.city}) - ${policy.title} (+${distanceBonus} pts)`;
              }
              // Same state gets medium bonus
              else if (match.state && patientHospitalResult.rows[0]?.state &&
                      match.state.toLowerCase() === patientHospitalResult.rows[0].state.toLowerCase()) {
                distanceBonus = 8;
                explanation = `Same state priority (${match.state}) - ${policy.title} (+${distanceBonus} pts)`;
              }
              // Different state/city
              else {
                distanceBonus = 0;
                explanation = `Distance consideration - ${policy.title} (no bonus)`;
              }
              
              if (distanceBonus > 0) {
                match.match_score = Math.min(100, match.match_score + distanceBonus);
                match.policy_applied = true;
                match.policy_name = policy.title;
                match.blockchain_verified = true;
              }
              
              match.explanation = (match.explanation || '') + (match.explanation ? '; ' : '') + explanation;
            });
          }
        }
        
        // Apply pediatric priority policies
        if (policyTitle.includes('pediatric') && patient.age < 18) {
          console.log(`👶 Applying ${policy.title} for pediatric patient`);
          matches.forEach(match => {
            match.match_score = Math.min(100, match.match_score + 5);
            match.policy_applied = true;
            match.policy_name = policy.title;
            match.explanation = (match.explanation || '') + `; ${policy.title} (+5 pts)`;
          });
        }
        
        // Apply urgent case priority policies
        if (policyTitle.includes('urgent') || policyTitle.includes('emergency') || policyTitle.includes('critical')) {
          if (patient.urgency_level === 'Critical') {
            console.log(`⚠️ Applying ${policy.title} for critical patient`);
            matches.forEach(match => {
              match.match_score = Math.min(100, match.match_score + 8);
              match.policy_applied = true;
              match.policy_name = policy.title;
              match.explanation = (match.explanation || '') + `; ${policy.title} (+8 pts)`;
            });
          }
        }
      }

      // Final re-sort after all policies applied
      matches.sort((a, b) => b.match_score - a.match_score);

      return matches;
    } catch (error) {
      console.error('Error applying blockchain policies:', error);
      return matches; // Return original matches if policy application fails
    }
  }
}

export const aiMatchingService = new AIMatchingService();
