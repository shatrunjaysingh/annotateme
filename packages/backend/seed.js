const pg = require('pg');
const bcrypt = require('bcryptjs');

const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  user: 'annotateme',
  password: 'annotateme',
  database: 'annotateme'
});

async function seed() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Create users table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        "firstName" VARCHAR(255),
        "lastName" VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Users table created');

    // Hash passwords
    const adminPassword = await bcrypt.hash('password123', 10);
    const managerPassword = await bcrypt.hash('password123', 10);
    const annotator1Password = await bcrypt.hash('password123', 10);
    const annotator2Password = await bcrypt.hash('password123', 10);

    // Insert admin user
    try {
      await client.query(
        `INSERT INTO users (email, username, password, "firstName", "lastName", role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['admin@annotateme.com', 'admin', adminPassword, 'Admin', 'User', 'admin']
      );
      console.log('✓ Admin user created: admin@annotateme.com');
    } catch (e) {
      if (e.code === '23505') {
        console.log('✓ Admin user already exists');
      } else throw e;
    }

    // Insert manager user
    try {
      await client.query(
        `INSERT INTO users (email, username, password, "firstName", "lastName", role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['manager@annotateme.com', 'manager', managerPassword, 'Manager', 'User', 'manager']
      );
      console.log('✓ Manager user created: manager@annotateme.com');
    } catch (e) {
      if (e.code === '23505') {
        console.log('✓ Manager user already exists');
      } else throw e;
    }

    // Insert annotator1 user
    try {
      await client.query(
        `INSERT INTO users (email, username, password, "firstName", "lastName", role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['annotator1@annotateme.com', 'annotator1', annotator1Password, 'John', 'Annotator', 'user']
      );
      console.log('✓ Annotator 1 user created: annotator1@annotateme.com');
    } catch (e) {
      if (e.code === '23505') {
        console.log('✓ Annotator 1 user already exists');
      } else throw e;
    }

    // Insert annotator2 user
    try {
      await client.query(
        `INSERT INTO users (email, username, password, "firstName", "lastName", role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['annotator2@annotateme.com', 'annotator2', annotator2Password, 'Jane', 'Annotator', 'user']
      );
      console.log('✓ Annotator 2 user created: annotator2@annotateme.com');
    } catch (e) {
      if (e.code === '23505') {
        console.log('✓ Annotator 2 user already exists');
      } else throw e;
    }

    console.log('\n✅ Database seeding completed!');
    console.log('\n🔑 You can now login with:');
    console.log('   Email: admin@annotateme.com');
    console.log('   Password: password123');
    console.log('\n   OR');
    console.log('   Email: manager@annotateme.com');
    console.log('   Password: password123');
    console.log('\n   OR');
    console.log('   Email: annotator1@annotateme.com');
    console.log('   Password: password123');

    await client.end();
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();
