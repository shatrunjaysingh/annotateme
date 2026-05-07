/**
 * Creates or resets the default admin user.
 * Usage: node create-admin.js [email] [password]
 * Default: admin@annotateme.com / admin
 */

const bcrypt = require("bcryptjs");
const { Client } = require("pg");
require("dotenv").config();

const email = process.argv[2] || "admin@annotateme.com";
const password = process.argv[3] || "admin";
const username = "admin";

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "annotateme",
    password: process.env.DB_PASSWORD || "annotateme",
    database: process.env.DB_NAME || "annotateme",
  });

  await client.connect();

  const hash = bcrypt.hashSync(password, 10);

  await client.query(
    `INSERT INTO users (id, email, username, password, "firstName", "lastName", role, "isActive", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, 'Admin', 'User', 'admin', true, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE
       SET password = EXCLUDED.password, role = 'admin', "isActive" = true, "updatedAt" = NOW()`,
    [email, username, hash]
  );

  console.log("✅ Admin user ready:");
  console.log(`   Email   : ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role    : admin`);

  await client.end();
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
