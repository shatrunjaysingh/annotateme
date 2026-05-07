#!/bin/bash

# AnnotateMe Database Initialization Script
# This script sets up PostgreSQL, runs migrations, and seeds sample data

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        AnnotateMe - Database Setup & Initialization        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-annotateme}
DB_PASSWORD=${DB_PASSWORD:-annotateme}
DB_NAME=${DB_NAME:-annotateme}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js is installed${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm is installed${NC}"

# Change to backend directory
cd "$(dirname "$0")/packages/backend"
echo ""
echo -e "${YELLOW}Working directory: $(pwd)${NC}"
echo ""

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Build TypeScript
echo ""
echo -e "${YELLOW}Building TypeScript...${NC}"
npm run build
echo -e "${GREEN}✓ Build completed${NC}"

# Check PostgreSQL connection
echo ""
echo -e "${YELLOW}Checking PostgreSQL connection...${NC}"
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" > /dev/null 2>&1; then
    echo -e "${RED}❌ PostgreSQL is not running at $DB_HOST:$DB_PORT${NC}"
    echo ""
    echo "Start PostgreSQL with Docker:"
    echo "  docker run -d -p 5432:5432 \\"
    echo "    -e POSTGRES_USER=$DB_USER \\"
    echo "    -e POSTGRES_PASSWORD=$DB_PASSWORD \\"
    echo "    -e POSTGRES_DB=$DB_NAME \\"
    echo "    postgres:15-alpine"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL is running${NC}"

# Run migrations
echo ""
echo -e "${YELLOW}Running database migrations...${NC}"
npm run migrate
echo -e "${GREEN}✓ Migrations completed${NC}"

# Run seed
echo ""
echo -e "${YELLOW}Seeding database with sample data...${NC}"
npm run seed
echo -e "${GREEN}✓ Database seeding completed${NC}"

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ Database Setup Complete!                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Database Information:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"
echo ""
echo -e "${GREEN}Seed Data:${NC}"
echo "  • 4 Users (admin, manager, annotator1, annotator2)"
echo "  • 2 Organizations (TechCorp, DataLabs)"
echo "  • 3 Projects (Object Detection, Text Classification, Audio Transcription)"
echo "  • 10 Sample Files"
echo "  • 5 Sample Annotations"
echo ""
echo -e "${GREEN}Test Login Credentials:${NC}"
echo "  Email: admin@annotateme.com"
echo "  Password: password123"
echo ""
echo "Next steps:"
echo "  1. Start the backend:    npm run dev"
echo "  2. Start the frontend:   cd ../../packages/frontend && npm start"
echo "  3. Access the app:       http://localhost:4200"
echo ""
