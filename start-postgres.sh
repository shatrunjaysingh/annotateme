#!/bin/bash

# Quick PostgreSQL setup script
# Run this if you don't have PostgreSQL running

echo "🐘 Starting PostgreSQL with Docker..."

docker run -d \
  --name annotateme_postgres \
  -p 5432:5432 \
  -e POSTGRES_USER=annotateme \
  -e POSTGRES_PASSWORD=annotateme \
  -e POSTGRES_DB=annotateme \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine

echo "✅ PostgreSQL container started"
echo ""
echo "Connection Details:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  User: annotateme"
echo "  Password: annotateme"
echo "  Database: annotateme"
echo ""
echo "Wait a few seconds for PostgreSQL to fully initialize, then run:"
echo "  ./setup-db.sh"
