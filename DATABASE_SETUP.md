# Database Setup Guide for AnnotateMe

## Overview

AnnotateMe uses PostgreSQL as the primary database. The database setup includes:
- 8 main tables (Users, Organizations, Projects, Files, Annotations, AnnotationLabels, Collaborations, Analytics)
- Automated migrations for schema creation
- Seed data for testing and development
- Indexes for query optimization

## Database Schema

### 1. Users Table
Stores user account information with role-based access control.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  username VARCHAR,
  password VARCHAR (hashed),
  firstName VARCHAR,
  lastName VARCHAR,
  role ENUM ('admin', 'manager', 'user'),
  isActive BOOLEAN,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

### 2. Organizations Table
Multi-tenant organizational structure.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name VARCHAR,
  description TEXT,
  logo VARCHAR,
  ownerId UUID FOREIGN KEY,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

### 3. Projects Table
Annotation projects with progress tracking.

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name VARCHAR,
  description TEXT,
  status ENUM ('active', 'archived', 'completed'),
  dataType ENUM ('image', 'text', 'audio', 'video'),
  labelSet JSON,
  totalItems INTEGER,
  annotatedItems INTEGER,
  progress INTEGER,
  organizationId UUID FOREIGN KEY,
  createdById UUID FOREIGN KEY,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

### 4. Files Table
Uploaded files awaiting annotation.

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY,
  originalName VARCHAR,
  fileName VARCHAR,
  mimeType VARCHAR,
  size INTEGER,
  path VARCHAR,
  status ENUM ('pending', 'processing', 'completed', 'failed'),
  projectId UUID FOREIGN KEY,
  uploadedAt TIMESTAMP
);
```

### 5. Annotations Table
Annotation records with status tracking.

```sql
CREATE TABLE annotations (
  id UUID PRIMARY KEY,
  fileId VARCHAR,
  data JSON,
  notes TEXT,
  status ENUM ('pending', 'in_progress', 'completed', 'rejected'),
  confidence DECIMAL,
  projectId UUID FOREIGN KEY,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_annotations_projectId ON annotations(projectId);
CREATE INDEX idx_annotations_status ON annotations(status);
```

### 6. AnnotationLabels Table
Individual labels within annotations (bounding boxes, classifications, etc.)

```sql
CREATE TABLE annotation_labels (
  id UUID PRIMARY KEY,
  label VARCHAR,
  coordinates JSON,
  confidence DECIMAL,
  annotationId UUID FOREIGN KEY,
  createdAt TIMESTAMP
);
```

### 7. Collaborations Table
Team collaboration and permissions.

```sql
CREATE TABLE collaborations (
  id UUID PRIMARY KEY,
  role ENUM ('viewer', 'annotator', 'manager', 'admin'),
  canEdit BOOLEAN,
  canDelete BOOLEAN,
  canInvite BOOLEAN,
  projectId UUID FOREIGN KEY,
  userId UUID FOREIGN KEY,
  joinedAt TIMESTAMP
);

-- Unique constraint on project-user pairs
CREATE UNIQUE INDEX idx_collaborations_project_user ON collaborations(projectId, userId);
```

### 8. Analytics Table
Performance metrics and statistics.

```sql
CREATE TABLE analytics (
  id UUID PRIMARY KEY,
  metric VARCHAR,
  value DECIMAL,
  details JSON,
  projectId UUID FOREIGN KEY,
  recordedAt TIMESTAMP
);

-- Indexes for time-series queries
CREATE INDEX idx_analytics_project_metric ON analytics(projectId, metric);
CREATE INDEX idx_analytics_recordedAt ON analytics(recordedAt);
```

### 9. UserOrganizations Table (Junction)
Many-to-many relationship between users and organizations.

```sql
CREATE TABLE user_organizations (
  userId UUID FOREIGN KEY,
  organizationId UUID FOREIGN KEY,
  PRIMARY KEY (userId, organizationId)
);
```

## Quick Start

### Using Docker Compose (Recommended)

```bash
cd /Users/shatrunjaysingh/AnnotateMe
docker-compose up -d
```

This automatically:
- Creates PostgreSQL container
- Runs migrations
- Seeds sample data

### Manual Setup

#### 1. Install Dependencies
```bash
cd packages/backend
npm install
```

#### 2. Create .env file
```bash
cp .env.example .env
```

#### 3. Start PostgreSQL
```bash
docker run -d \
  -p 5432:5432 \
  -e POSTGRES_USER=annotateme \
  -e POSTGRES_PASSWORD=annotateme \
  -e POSTGRES_DB=annotateme \
  postgres:15-alpine
```

#### 4. Build TypeScript
```bash
npm run build
```

#### 5. Run Migrations
```bash
npm run migrate
```

#### 6. Seed Database
```bash
npm run seed
```

### All-in-One Command
```bash
npm run init-db
```

## Seed Data

The database is seeded with sample data for development:

### Users (4)
| Email | Username | Role | Password |
|-------|----------|------|----------|
| admin@annotateme.com | admin | admin | password123 |
| manager@annotateme.com | manager | manager | password123 |
| annotator1@annotateme.com | annotator1 | user | password123 |
| annotator2@annotateme.com | annotator2 | user | password123 |

### Organizations (2)
1. **TechCorp** - Technology annotation company (Owner: admin)
2. **DataLabs** - Data annotation laboratory (Owner: manager)

### Projects (3)
1. **Object Detection - Dataset 1**
   - Data Type: Image
   - Status: Active
   - Progress: 45%
   - Labels: car, person, bicycle, dog, cat

2. **Text Classification - Sentiment**
   - Data Type: Text
   - Status: Active
   - Progress: 60%
   - Labels: positive, negative, neutral

3. **Audio Transcription**
   - Data Type: Audio
   - Status: Completed
   - Progress: 100%
   - Labels: speech, music, noise, silence

### Sample Data
- 10 files per project
- 5 sample annotations
- Complete collaboration setup
- 6 analytics records

## Database Operations

### View All Migrations
```bash
npm run typeorm migration:show
```

### Create New Migration
```bash
npm run typeorm migration:create -- -n YourMigrationName
```

### Revert Last Migration
```bash
npm run typeorm migration:revert
```

### Reset Database (Caution!)
```bash
# Drop all tables
npm run typeorm schema:drop

# Recreate schema
npm run typeorm schema:sync
```

## Backup & Restore

### Backup Database
```bash
pg_dump -h localhost -U annotateme annotateme > backup.sql
```

### Restore Database
```bash
psql -h localhost -U annotateme annotateme < backup.sql
```

### Docker Backup
```bash
docker exec annotateme_db pg_dump -U annotateme annotateme > backup.sql
```

## Performance Optimization

### Indexes Created
1. `annotations(projectId)` - Fast project filtering
2. `annotations(status)` - Status-based queries
3. `collaborations(projectId, userId)` - Unique collaboration lookup
4. `analytics(projectId, metric)` - Analytics aggregation
5. `analytics(recordedAt)` - Time-series queries

### Query Optimization Tips
- Always filter by `projectId` when querying annotations
- Use `status` index for status-based filtering
- Batch analytics queries by date range

## Troubleshooting

### Connection Issues
```bash
# Test connection
psql -h localhost -U annotateme -d annotateme

# Check if running
docker ps | grep annotateme_db

# View logs
docker logs annotateme_db
```

### Migration Failed
```bash
# Check migration status
npm run typeorm migration:show

# Revert problematic migration
npm run typeorm migration:revert

# Re-apply
npm run typeorm migration:run
```

### Reset Development Database
```bash
# Inside PostgreSQL container
docker exec annotateme_db dropdb -U annotateme annotateme
docker exec annotateme_db createdb -U annotateme annotateme

# Re-run migrations and seed
npm run init-db
```

## Environment Variables

Create `.env` file in `packages/backend`:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=annotateme
DB_PASSWORD=annotateme
DB_NAME=annotateme

# Application
NODE_ENV=development
PORT=3000
JWT_SECRET=your_secret_key_here

# Optional
LOG_LEVEL=debug
DB_SYNCHRONIZE=false
DB_LOGGING=true
```

## Production Deployment

For production, modify database configuration:

```env
DB_HOST=prod-db.example.com
DB_PORT=5432
DB_USER=prod_user
DB_PASSWORD=strong_password_here
DB_NAME=annotateme_prod
NODE_ENV=production
DB_SYNCHRONIZE=false
DB_LOGGING=false
```

### SSL Connection
```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
```

### Connection Pooling
Modify `data-source.ts`:
```typescript
extra: {
  max: 20,
  min: 5,
  connectionTimeoutMillis: 5000,
}
```

## Monitoring

### Connection Pool Status
```typescript
// In your app
const connectionState = AppDataSource.isInitialized;
const activeConnections = AppDataSource.driver.connectionPool;
```

### Query Logging
Enable in `.env`:
```env
DB_LOGGING=true
```

View logs to monitor slow queries.

---

**Database Version:** PostgreSQL 15+
**ORM:** TypeORM 0.3+
**Last Updated:** May 3, 2026
