import bcrypt from 'bcryptjs';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_gV6OIzYPR0Jh@ep-quiet-thunder-adtsc7t7-pooler.c-2.us-east-1.aws.neon.tech/organlink_db?sslmode=require'
});

async function setup() {
  try {
    // Hash the password "org123"
    const passwordHash = await bcrypt.hash('org123', 10);
    console.log('Password hash for "org123":', passwordHash);

    // Clear existing data
    await pool.query('DELETE FROM policy_votes');
    await pool.query('DELETE FROM policies');
    await pool.query('DELETE FROM notifications WHERE organization_id IS NOT NULL');
    await pool.query('DELETE FROM organizations');
    console.log('✅ Cleared existing data');

    // Create 6 test organizations
    const orgs = [
      { name: 'Organization A', email: 'orga@test.com', country: 'USA' },
      { name: 'Organization B', email: 'orgb@test.com', country: 'UK' },
      { name: 'Organization C', email: 'orgc@test.com', country: 'Canada' },
      { name: 'Organization D', email: 'orgd@test.com', country: 'Australia' },
      { name: 'Organization E', email: 'orge@test.com', country: 'Germany' },
      { name: 'Organization F', email: 'orgf@test.com', country: 'France' },
    ];

    for (const org of orgs) {
      await pool.query(
        'INSERT INTO organizations (name, email, password_hash, country) VALUES ($1, $2, $3, $4)',
        [org.name, org.email, passwordHash, org.country]
      );
    }

    console.log('✅ Created 6 test organizations');
    console.log('\nLogin credentials:');
    orgs.forEach(org => {
      console.log(`  ${org.email} / org123`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

setup();
