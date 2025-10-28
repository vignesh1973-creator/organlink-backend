import { pool } from "../config/database.js";

interface Patient {
  patient_id: string;
  full_name: string;
  age: number;
  gender: string;
  blood_type: string;
  organ_needed: string;
  urgency_level: string;
  medical_condition: string;
  registration_date: string;
  hospital_id: string;
  city?: string;
  state?: string;
  country?: string;
  hospital_latitude?: number;
  hospital_longitude?: number;
  hospital_name?: string;
}

interface Donor {
  donor_id: string;
  donor_name: string;
  age: number;
  gender: string;
  blood_type: string;
  organs_available: string[];
  hospital_id: string;
  hospital_name: string;
  city?: string;
  state?: string;
  country?: string;
  hospital_latitude?: number;
  hospital_longitude?: number;
  is_active: boolean;
}

interface MatchScore {
  donor_id: string;
  donor_name: string;
  blood_type: string;
  organs_available: string[];
  hospital_id: string;
  hospital_name: string;
  match_score: number;
  compatibility_score: number;
  urgency_bonus: number;
  distance_score: number;
  age_compatibility: number;
  medical_risk_score: number;
  time_score: number;
  explanation: string;
}

// Enhanced medical risk assessment based on the dataset patterns
function calculateMedicalRiskScore(patient: Patient, donor: any): number {
  let riskScore = 100; // Start with perfect score

  // Age compatibility (from dataset analysis)
  const ageDiff = Math.abs(patient.age - donor.age);
  if (ageDiff > 20) riskScore -= 15;
  else if (ageDiff > 10) riskScore -= 8;
  else if (ageDiff <= 5) riskScore += 5; // Bonus for similar age

  // Gender compatibility bonus (some organs have better outcomes with same gender)
  if (
    patient.gender === donor.gender &&
    ["Heart", "Liver"].includes(patient.organ_needed)
  ) {
    riskScore += 5;
  }

  // Age-specific risk factors based on dataset patterns
  if (patient.age < 18) {
    // Pediatric patients - higher priority, different risk profile
    riskScore += 10;
    if (donor.age < 30) riskScore += 5; // Young donor for young patient
  } else if (patient.age > 65) {
    // Elderly patients - consider donor age more carefully
    if (donor.age > 65) riskScore -= 10;
    if (donor.age < 50) riskScore += 5;
  }

  // Organ-specific risk assessment
  switch (patient.organ_needed.toLowerCase()) {
    case "heart":
      // Heart transplants are most critical
      if (ageDiff > 15) riskScore -= 20;
      if (patient.urgency_level === "Critical") riskScore += 15;
      break;
    case "kidney":
      // Kidney transplants are more flexible
      if (ageDiff > 25) riskScore -= 10;
      break;
    case "liver":
      // Liver transplants - size matters (age is proxy for size)
      if (ageDiff > 20) riskScore -= 15;
      break;
    case "lung":
    case "lungs":
      // Lung transplants - very age sensitive
      if (ageDiff > 10) riskScore -= 25;
      break;
  }

  return Math.max(0, Math.min(100, riskScore));
}

// Enhanced blood compatibility with detailed scoring
function calculateBloodCompatibility(
  patientBlood: string,
  donorBlood: string,
): number {
  const compatibility: { [key: string]: { [key: string]: number } } = {
    "O-": {
      "O-": 100,
      "O+": 95,
      "A-": 90,
      "A+": 85,
      "B-": 90,
      "B+": 85,
      "AB-": 85,
      "AB+": 80,
    },
    "O+": {
      "O-": 85,
      "O+": 100,
      "A-": 0,
      "A+": 90,
      "B-": 0,
      "B+": 90,
      "AB-": 0,
      "AB+": 85,
    },
    "A-": {
      "O-": 95,
      "O+": 85,
      "A-": 100,
      "A+": 95,
      "B-": 0,
      "B+": 0,
      "AB-": 85,
      "AB+": 80,
    },
    "A+": {
      "O-": 85,
      "O+": 90,
      "A-": 85,
      "A+": 100,
      "B-": 0,
      "B+": 0,
      "AB-": 0,
      "AB+": 85,
    },
    "B-": {
      "O-": 95,
      "O+": 85,
      "A-": 0,
      "A+": 0,
      "B-": 100,
      "B+": 95,
      "AB-": 85,
      "AB+": 80,
    },
    "B+": {
      "O-": 85,
      "O+": 90,
      "A-": 0,
      "A+": 0,
      "B-": 85,
      "B+": 100,
      "AB-": 0,
      "AB+": 85,
    },
    "AB-": {
      "O-": 90,
      "O+": 80,
      "A-": 90,
      "A+": 80,
      "B-": 90,
      "B+": 80,
      "AB-": 100,
      "AB+": 95,
    },
    "AB+": {
      "O-": 85,
      "O+": 85,
      "A-": 85,
      "A+": 85,
      "B-": 85,
      "B+": 85,
      "AB-": 90,
      "AB+": 100,
    },
  };

  return compatibility[patientBlood]?.[donorBlood] || 0;
}

// Enhanced urgency scoring based on medical condition patterns
function calculateUrgencyScore(
  urgencyLevel: string,
  age: number,
  organNeeded: string,
): number {
  let baseScore = 0;

  switch (urgencyLevel.toLowerCase()) {
    case "critical":
      baseScore = 100;
      break;
    case "high":
      baseScore = 75;
      break;
    case "medium":
      baseScore = 50;
      break;
    case "low":
      baseScore = 25;
      break;
    default:
      baseScore = 25;
  }

  // Age-based urgency adjustments
  if (age < 18)
    baseScore += 15; // Pediatric priority
  else if (age > 70) baseScore += 10; // Elderly consideration

  // Organ-specific urgency adjustments
  switch (organNeeded.toLowerCase()) {
    case "heart":
      baseScore += 20; // Heart is most critical
      break;
    case "liver":
      baseScore += 15; // Liver is second most critical
      break;
    case "lung":
    case "lungs":
      baseScore += 10; // Lungs are critical but more available
      break;
    case "kidney":
      baseScore += 5; // Kidneys have dialysis as backup
      break;
  }

  return Math.min(100, baseScore);
}

// Calculate geographical distance (simplified for now)
function calculateDistance(
  lat1?: number,
  lon1?: number,
  lat2?: number,
  lon2?: number,
): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return 500; // Default assumption of 500km if coordinates not available
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate distance score based on city/state proximity (like aiMatching.ts)
function calculateDistanceScoreByCityState(
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
      explanation: `Same city (${donorLocation.city}) - Fastest transport`,
    };
  }

  // Same state, different city = high score (regional match)
  if (pState && dState && pState === dState) {
    return {
      score: 75,
      category: 'Regional',
      explanation: `Same state (${donorLocation.state}) - Within state`,
    };
  }

  // Same country, different state = medium score (national match)
  if (pCountry && dCountry && pCountry === dCountry) {
    return {
      score: 50,
      category: 'National',
      explanation: `Different state (${donorLocation.state || 'Unknown'}) - Interstate transport`,
    };
  }

  // Different country = lower score (international match)
  return {
    score: 30,
    category: 'International',
    explanation: `Different country (${donorLocation.country || 'Unknown'}) - International`,
  };
}

function calculateDistanceScore(distance: number): number {
  // Closer is better, with diminishing returns
  if (distance <= 50) return 100;
  if (distance <= 100) return 90;
  if (distance <= 200) return 80;
  if (distance <= 300) return 70;
  if (distance <= 500) return 60;
  if (distance <= 750) return 50;
  if (distance <= 1000) return 40;
  return Math.max(20, 40 - (distance - 1000) / 100);
}

// Time-based scoring (how long patient has been waiting)
function calculateTimeScore(registrationDate: string): number {
  const regDate = new Date(registrationDate);
  const now = new Date();
  const daysSinceRegistration = Math.floor(
    (now.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Longer waiting time = higher score
  if (daysSinceRegistration > 365) return 100; // Over a year
  if (daysSinceRegistration > 180) return 90; // Over 6 months
  if (daysSinceRegistration > 90) return 80; // Over 3 months
  if (daysSinceRegistration > 30) return 70; // Over a month
  if (daysSinceRegistration > 14) return 60; // Over 2 weeks
  if (daysSinceRegistration > 7) return 50; // Over a week
  return 40; // Less than a week
}

export async function findEnhancedMatches(
  patientId: string,
): Promise<MatchScore[]> {
  try {
    // Get patient details with hospital location INCLUDING city/state
    // Only match patients that are actively waiting or in progress (not Completed)
    const patientQuery = `
      SELECT p.*, h.name as hospital_name, h.city, h.state, h.country
      FROM patients p
      JOIN hospitals h ON p.hospital_id = h.hospital_id
      WHERE p.patient_id = $1 
        AND (p.status IS NULL OR p.status IN ('Waiting', 'In Progress', 'Matched'))
    `;
    const patientResult = await pool.query(patientQuery, [patientId]);

    if (patientResult.rows.length === 0) {
      throw new Error("Patient not found");
    }

    const patient: Patient = patientResult.rows[0];

    // Get all potential donors across all hospitals INCLUDING city/state
    const donorsQuery = `
      SELECT
        d.donor_id,
        d.full_name as donor_name,
        d.age,
        d.gender,
        d.blood_type,
        d.organs_to_donate as organs_available,
        d.hospital_id,
        h.name as hospital_name,
        h.city,
        h.state,
        h.country,
        d.is_active,
        d.signature_verified
      FROM donors d
      JOIN hospitals h ON d.hospital_id = h.hospital_id
      WHERE d.is_active = true
        AND (d.status IS NULL OR d.status = 'Available')
    `;

    const donorsResult = await pool.query(donorsQuery);
    const donorsAll: Donor[] = donorsResult.rows.map((row) => ({
      donor_id: row.donor_id,
      donor_name: row.donor_name,
      age: row.age,
      gender: row.gender,
      blood_type: row.blood_type,
      organs_available: Array.isArray(row.organs_available)
        ? row.organs_available
        : String(row.organs_available || "")
            .split(",")
            .map((o: string) => o.trim())
            .filter(Boolean),
      hospital_id: row.hospital_id,
      hospital_name: row.hospital_name,
      city: row.city,
      state: row.state,
      country: row.country,
      is_active: row.is_active,
    }));

    const neededOrgan = String(patient.organ_needed || "").toLowerCase();
    const normalize = (s: string) => s.trim().toLowerCase().replace(/s$/, "");
    const donors = donorsAll.filter((d) =>
      d.organs_available.some(
        (o) => normalize(String(o)) === normalize(neededOrgan),
      ),
    );

    // Calculate enhanced match scores for each donor
    const matches: MatchScore[] = donors.map((donor) => {
      // Core compatibility scores
      const bloodCompatibility = calculateBloodCompatibility(
        patient.blood_type,
        donor.blood_type,
      );
      const urgencyScore = calculateUrgencyScore(
        patient.urgency_level,
        patient.age,
        patient.organ_needed,
      );
      
      // Use city/state-based distance calculation (not GPS)
      const distanceResult = calculateDistanceScoreByCityState(
        { city: patient.city, state: patient.state, country: patient.country },
        { city: donor.city, state: donor.state, country: donor.country },
      );
      const distanceScore = distanceResult.score;
      
      const timeScore = calculateTimeScore(patient.registration_date);
      const medicalRiskScore = calculateMedicalRiskScore(patient, donor);

      // Enhanced weighted scoring algorithm (based on medical research)
      const weightedScore =
        bloodCompatibility * 0.35 + // Blood compatibility - most critical
        urgencyScore * 0.25 + // Patient urgency
        distanceScore * 0.15 + // Geographical proximity
        timeScore * 0.1 + // Waiting time
        medicalRiskScore * 0.15; // Medical risk assessment

      // Generate human-readable explanation
      let explanation = `Blood: ${bloodCompatibility}% | Distance: ${distanceResult.category} (${distanceScore}%)`;
      if (urgencyScore > 80)
        explanation += ` | High urgency (${patient.urgency_level})`;
      if (timeScore > 70) explanation += ` | Extended wait time`;
      if (medicalRiskScore > 85)
        explanation += ` | Excellent medical compatibility`;
      
      // Add detailed distance explanation
      explanation += ` - ${distanceResult.explanation}`;

      return {
        donor_id: donor.donor_id,
        donor_name: donor.donor_name,
        blood_type: donor.blood_type,
        organs_available: donor.organs_available,
        hospital_id: donor.hospital_id,
        hospital_name: donor.hospital_name,
        match_score: Math.round(weightedScore),
        compatibility_score: Math.round(bloodCompatibility),
        urgency_bonus: Math.round(urgencyScore),
        distance_score: Math.round(distanceScore),
        age_compatibility: Math.round(medicalRiskScore),
        medical_risk_score: Math.round(medicalRiskScore),
        time_score: Math.round(timeScore),
        explanation,
      };
    });

    // Sort by match score (highest first) and return top matches
    return matches
      .filter((match) => match.match_score > 40) // Only return viable matches
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 10); // Top 10 matches
  } catch (error) {
    console.error("Enhanced AI matching error:", error);
    throw error;
  }
}

// Predictive analytics based on dataset patterns
export async function predictTransplantSuccess(
  patientId: string,
  donorId: string,
): Promise<{
  successProbability: number;
  riskFactors: string[];
  recommendations: string[];
}> {
  try {
    const patientQuery = `SELECT * FROM patients WHERE patient_id = $1`;
    const donorQuery = `SELECT * FROM donors WHERE donor_id = $1`;

    const [patientResult, donorResult] = await Promise.all([
      pool.query(patientQuery, [patientId]),
      pool.query(donorQuery, [donorId]),
    ]);

    if (patientResult.rows.length === 0 || donorResult.rows.length === 0) {
      throw new Error("Patient or donor not found");
    }

    const patient = patientResult.rows[0];
    const donor = donorResult.rows[0];

    let successProbability = 75; // Base success rate
    const riskFactors: string[] = [];
    const recommendations: string[] = [];

    // Age-based success prediction (from dataset analysis)
    const ageDiff = Math.abs(patient.age - donor.age);
    if (ageDiff > 20) {
      successProbability -= 15;
      riskFactors.push(
        "Significant age difference between donor and recipient",
      );
      recommendations.push("Consider additional pre-operative screening");
    } else if (ageDiff <= 5) {
      successProbability += 10;
    }

    // Blood type compatibility impact
    const bloodCompat = calculateBloodCompatibility(
      patient.blood_type,
      donor.blood_type,
    );
    if (bloodCompat < 80) {
      successProbability -= 20;
      riskFactors.push("Suboptimal blood type compatibility");
      recommendations.push(
        "Enhanced immunosuppression protocol may be required",
      );
    } else if (bloodCompat === 100) {
      successProbability += 15;
    }

    // Organ-specific success rates (based on medical literature)
    switch (patient.organ_needed.toLowerCase()) {
      case "kidney":
        successProbability += 10; // Kidneys have high success rates
        break;
      case "heart":
        if (patient.age > 65) {
          successProbability -= 10;
          riskFactors.push("Advanced age for heart transplant");
        }
        break;
      case "liver":
        if (patient.urgency_level === "Critical") {
          successProbability -= 5;
          riskFactors.push("Critical condition may affect recovery");
        }
        break;
      case "lung":
      case "lungs":
        successProbability -= 5; // Lung transplants are generally more complex
        if (ageDiff > 10) {
          successProbability -= 10;
          riskFactors.push("Age compatibility critical for lung transplants");
        }
        break;
    }

    // Urgency level impact
    if (patient.urgency_level === "Critical") {
      successProbability -= 5;
      riskFactors.push("Critical condition increases surgical risk");
      recommendations.push("Expedited surgical planning and ICU preparation");
    }

    // Gender matching (some organs benefit from gender matching)
    if (
      patient.gender === donor.gender &&
      ["Heart", "Liver"].includes(patient.organ_needed)
    ) {
      successProbability += 5;
    }

    // Final success probability
    successProbability = Math.max(30, Math.min(95, successProbability));

    // Add standard recommendations
    recommendations.push("Complete tissue typing and crossmatching");
    recommendations.push("Coordinate transportation logistics");
    if (successProbability < 70) {
      recommendations.push(
        "Consider patient counseling regarding increased risks",
      );
    }

    return {
      successProbability,
      riskFactors,
      recommendations,
    };
  } catch (error) {
    console.error("Transplant success prediction error:", error);
    throw error;
  }
}

// Generate insights based on dataset patterns
export async function generateMatchingInsights(hospitalId: string): Promise<{
  totalPatients: number;
  avgWaitTime: number;
  successRate: number;
  criticalCases: number;
  organDemand: { [organ: string]: number };
  recommendations: string[];
}> {
  try {
    const patientsQuery = `
      SELECT organ_needed, urgency_level, registration_date
      FROM patients 
      WHERE hospital_id = $1 AND is_active = true
    `;
    const patientsResult = await pool.query(patientsQuery, [hospitalId]);

    const totalPatients = patientsResult.rows.length;
    const criticalCases = patientsResult.rows.filter(
      (p) => p.urgency_level === "Critical",
    ).length;

    // Calculate average wait time
    const now = new Date();
    const waitTimes = patientsResult.rows.map((p) => {
      const regDate = new Date(p.registration_date);
      return Math.floor(
        (now.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24),
      );
    });
    const avgWaitTime =
      waitTimes.reduce((sum, days) => sum + days, 0) / waitTimes.length || 0;

    // Organ demand analysis
    const organDemand: { [organ: string]: number } = {};
    patientsResult.rows.forEach((p) => {
      organDemand[p.organ_needed] = (organDemand[p.organ_needed] || 0) + 1;
    });

    // Mock success rate calculation (would be based on historical data)
    const successRate = 78; // Based on typical transplant success rates

    // Generate recommendations
    const recommendations: string[] = [];

    if (avgWaitTime > 180) {
      recommendations.push(
        "Average wait time is high - consider expanding donor network",
      );
    }

    if (criticalCases > totalPatients * 0.2) {
      recommendations.push(
        "High number of critical cases - prioritize urgent matching",
      );
    }

    const highDemandOrgans = Object.entries(organDemand)
      .filter(([_, count]) => count > totalPatients * 0.3)
      .map(([organ, _]) => organ);

    if (highDemandOrgans.length > 0) {
      recommendations.push(
        `High demand for: ${highDemandOrgans.join(", ")} - focus donor recruitment`,
      );
    }

    return {
      totalPatients,
      avgWaitTime: Math.round(avgWaitTime),
      successRate,
      criticalCases,
      organDemand,
      recommendations,
    };
  } catch (error) {
    console.error("Matching insights error:", error);
    throw error;
  }
}
