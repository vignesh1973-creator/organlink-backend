import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

// Create database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createBlockchainTables() {
  try {
    console.log("🚀 Creating blockchain policy tables...");

    // Create blockchain_policy_proposals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blockchain_policy_proposals (
        id SERIAL PRIMARY KEY,
        policy_id INTEGER NOT NULL,
        organization_id INTEGER REFERENCES organizations(organization_id),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        blockchain_tx_hash VARCHAR(66),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(policy_id)
      )
    `);
    console.log("✅ blockchain_policy_proposals table created");

    // Create blockchain_policy_votes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blockchain_policy_votes (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES organizations(organization_id),
        policy_id INTEGER NOT NULL,
        vote BOOLEAN NOT NULL,
        blockchain_tx_hash VARCHAR(66),
        voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id, policy_id)
      )
    `);
    console.log("✅ blockchain_policy_votes table created");

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blockchain_proposals_policy_id ON blockchain_policy_proposals(policy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blockchain_votes_policy_id ON blockchain_policy_votes(policy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blockchain_votes_org_id ON blockchain_policy_votes(organization_id)`);
    console.log("✅ Indexes created");

    console.log("\n🎉 Blockchain policy tables setup completed successfully!");
    
  } catch (error) {
    console.error("❌ Error creating blockchain tables:", error);
  } finally {
    await pool.end();
  }
}

// Run the script
createBlockchainTables();