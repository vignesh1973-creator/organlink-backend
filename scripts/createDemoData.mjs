import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
import bcrypt from "bcryptjs";

// Create database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createDemoData() {
  try {
    console.log("🚀 Creating demo data for OrganLink...");

    // Create admin user
    const adminPassword = await bcrypt.hash("admin123", 10);
    await pool.query(
      `INSERT INTO admin_users (username, email, password_hash, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       ON CONFLICT (email) DO NOTHING`,
      ["admin", "admin@organlink.com", adminPassword]
    );
    console.log("✅ Admin user created");

    // Create demo hospitals
    const hospitals = [
      {
        name: "AIIMS Delhi",
        email: "aiims.delhi@hospital.com", 
        password: "hospital123",
        address: "Ansari Nagar East",
        city: "Delhi",
        state: "Delhi",
        country: "India",
        phone: "+91-11-26588500"
      },
      {
        name: "Apollo Chennai", 
        email: "apollo.chennai@hospital.com",
        password: "hospital123", 
        address: "21, Greams Lane",
        city: "Chennai",
        state: "Tamil Nadu", 
        country: "India",
        phone: "+91-44-28293333"
      },
      {
        name: "Fortis Mumbai",
        email: "fortis.mumbai@hospital.com",
        password: "hospital123",
        address: "Mulund Goregaon Link Road", 
        city: "Mumbai",
        state: "Maharashtra",
        country: "India", 
        phone: "+91-22-67920000"
      }
    ];

    for (const hospital of hospitals) {
      const hashedPassword = await bcrypt.hash(hospital.password, 10);
      const result = await pool.query(
        `INSERT INTO hospitals (hospital_name, email, password_hash, address, city, state, country, phone, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (email) DO UPDATE SET
         hospital_name = EXCLUDED.hospital_name,
         address = EXCLUDED.address,
         city = EXCLUDED.city,
         state = EXCLUDED.state,
         country = EXCLUDED.country,
         phone = EXCLUDED.phone
         RETURNING hospital_id`,
        [hospital.name, hospital.email, hashedPassword, hospital.address, 
         hospital.city, hospital.state, hospital.country, hospital.phone]
      );
      console.log(`✅ Hospital created: ${hospital.name}`);
    }

    // Get hospital IDs for demo data
    const hospitalIds = await pool.query("SELECT hospital_id, hospital_name FROM hospitals ORDER BY hospital_id");
    
    // Create demo donors for each hospital
    const demoDonors = [
      // AIIMS Delhi donors
      {
        hospital_id: hospitalIds.rows[0].hospital_id,
        full_name: "Nikhil Kumar", 
        age: 28,
        gender: "Male",
        blood_type: "O+",
        organs_to_donate: JSON.stringify(["Kidney", "Liver"]),
        contact_phone: "+91-9876543210",
        contact_email: "nikhil.kumar@email.com",
        medical_history: "Healthy donor with no major medical conditions"
      },
      {
        hospital_id: hospitalIds.rows[0].hospital_id,
        full_name: "Priya Sharma",
        age: 32, 
        gender: "Female",
        blood_type: "A+",
        organs_to_donate: JSON.stringify(["Heart", "Lungs"]),
        contact_phone: "+91-9876543211", 
        contact_email: "priya.sharma@email.com",
        medical_history: "Regular health checkups, no complications"
      },
      // Apollo Chennai donors
      {
        hospital_id: hospitalIds.rows[1].hospital_id,
        full_name: "Ravi Krishnan",
        age: 35,
        gender: "Male", 
        blood_type: "O+",
        organs_to_donate: JSON.stringify(["Kidney"]),
        contact_phone: "+91-9876543212",
        contact_email: "ravi.krishnan@email.com", 
        medical_history: "Active lifestyle, excellent kidney health"
      },
      {
        hospital_id: hospitalIds.rows[1].hospital_id,
        full_name: "Deepika Menon",
        age: 29,
        gender: "Female",
        blood_type: "B+", 
        organs_to_donate: JSON.stringify(["Liver", "Pancreas"]),
        contact_phone: "+91-9876543213",
        contact_email: "deepika.menon@email.com",
        medical_history: "Non-smoker, non-drinker, healthy liver"
      },
      // Fortis Mumbai donors  
      {
        hospital_id: hospitalIds.rows[2].hospital_id,
        full_name: "Arjun Patel",
        age: 26,
        gender: "Male",
        blood_type: "O+", 
        organs_to_donate: JSON.stringify(["Kidney", "Heart"]),
        contact_phone: "+91-9876543214",
        contact_email: "arjun.patel@email.com",
        medical_history: "Athlete with excellent cardiovascular health"
      }
    ];

    for (const donor of demoDonors) {
      await pool.query(
        `INSERT INTO donors (
          hospital_id, full_name, age, gender, blood_type, organs_to_donate,
          medical_history, contact_phone, contact_email, signature_verified, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW())
        ON CONFLICT DO NOTHING`,
        [
          donor.hospital_id, donor.full_name, donor.age, donor.gender,
          donor.blood_type, donor.organs_to_donate, donor.medical_history,
          donor.contact_phone, donor.contact_email
        ]
      );
    }
    console.log("✅ Demo donors created");

    // Create demo patients for each hospital
    const demoPatients = [
      // AIIMS Delhi patients
      {
        hospital_id: hospitalIds.rows[0].hospital_id,
        full_name: "Meera Singh",
        age: 45,
        gender: "Female", 
        blood_type: "O+",
        organ_needed: "Kidney",
        urgency_level: "High",
        medical_history: "Chronic kidney disease, needs transplant urgently",
        contact_phone: "+91-9876543220"
      },
      {
        hospital_id: hospitalIds.rows[0].hospital_id,
        full_name: "Rajesh Gupta", 
        age: 52,
        gender: "Male",
        blood_type: "A+", 
        organ_needed: "Heart",
        urgency_level: "Critical",
        medical_history: "Heart failure, on waiting list for 6 months",
        contact_phone: "+91-9876543221"
      },
      // Apollo Chennai patients
      {
        hospital_id: hospitalIds.rows[1].hospital_id,
        full_name: "Lakshmi Iyer",
        age: 38,
        gender: "Female",
        blood_type: "B+",
        organ_needed: "Liver", 
        urgency_level: "Medium",
        medical_history: "Liver cirrhosis, stable condition",
        contact_phone: "+91-9876543222"
      },
      // Fortis Mumbai patients
      {
        hospital_id: hospitalIds.rows[2].hospital_id,
        full_name: "Vikram Joshi",
        age: 41, 
        gender: "Male",
        blood_type: "O+",
        organ_needed: "Kidney",
        urgency_level: "Medium",
        medical_history: "Kidney stones led to kidney damage",
        contact_phone: "+91-9876543223"
      }
    ];

    for (const patient of demoPatients) {
      await pool.query(
        `INSERT INTO patients (
          hospital_id, full_name, age, gender, blood_type, organ_needed,
          urgency_level, medical_history, contact_phone, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT DO NOTHING`,
        [
          patient.hospital_id, patient.full_name, patient.age, patient.gender,
          patient.blood_type, patient.organ_needed, patient.urgency_level,
          patient.medical_history, patient.contact_phone
        ]
      );
    }
    console.log("✅ Demo patients created");

    // Create demo organizations for blockchain policy voting
    const demoOrganizations = [
      {
        name: "National Kidney Board",
        email: "nkb@organlink.com",
        password: "org123",
        region: "National", 
        description: "Handles national kidney transplant policies"
      },
      {
        name: "Liver Health Council",
        email: "lhc@organlink.com", 
        password: "org123",
        region: "National",
        description: "Handles liver donor-related frameworks"
      }
    ];

    for (const org of demoOrganizations) {
      const hashedPassword = await bcrypt.hash(org.password, 10);
      await pool.query(
        `INSERT INTO organizations (name, email, password_hash, region, description, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         region = EXCLUDED.region, 
         description = EXCLUDED.description`,
        [org.name, org.email, hashedPassword, org.region, org.description]
      );
    }
    console.log("✅ Demo organizations created");

    console.log("\n🎉 Demo data creation completed successfully!");
    console.log("\n📋 Login Credentials:");
    console.log("Admin: admin@organlink.com / admin123");
    console.log("AIIMS Delhi: aiims.delhi@hospital.com / hospital123");
    console.log("Apollo Chennai: apollo.chennai@hospital.com / hospital123");
    console.log("Fortis Mumbai: fortis.mumbai@hospital.com / hospital123");
    console.log("National Kidney Board: nkb@organlink.com / org123");
    console.log("Liver Health Council: lhc@organlink.com / org123");

  } catch (error) {
    console.error("❌ Error creating demo data:", error);
  } finally {
    await pool.end();
  }
}

// Run the script
createDemoData();