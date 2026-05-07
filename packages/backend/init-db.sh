#!/bin/bash

# Database initialization script for AnnotateMe

set -e

echo "🚀 Starting AnnotateMe Database Setup..."

# Check if PostgreSQL is running
echo "Checking PostgreSQL connection..."
if ! pg_isready -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running!"
    exit 1
fi
echo "✅ PostgreSQL is running"

# Run migrations
echo ""
echo "Running database migrations..."
npm run migrate
echo "✅ Migrations completed"

# Seed the database
echo ""
echo "Seeding database with sample data..."
npm run seed
echo "✅ Database seeding completed"

echo ""
echo "✅ Database setup completed successfully!"
echo "You can now start the application."
