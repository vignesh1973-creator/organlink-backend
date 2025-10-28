import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_gV6OIzYPR0Jh@ep-quiet-thunder-adtsc7t7-pooler.c-2.us-east-1.aws.neon.tech/organlink_db?sslmode=require&channel_binding=require";

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 30, // Maximum number of clients in the pool
  idleTimeoutMillis: 60000, // Close idle clients after 60 seconds
  connectionTimeoutMillis: 20000, // Return an error after 20 seconds if connection could not be established
  statement_timeout: 120000, // Statement timeout 120 seconds (2 minutes)
  query_timeout: 120000, // Query timeout 120 seconds
});

// Test the connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Database connection error:", err);
});
