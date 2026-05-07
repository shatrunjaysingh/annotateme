# AnnotateMe - Quick Start Guide

## Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- Git

## Fastest Start (Docker Compose)

```bash
cd /Users/shatrunjaysingh/AnnotateMe
docker-compose up -d
```

This starts:
- PostgreSQL database
- MinIO (S3-compatible local storage)
- Node.js backend API
- Angular frontend

Wait 30 seconds for all services to initialize.

### Access the Application
- Frontend: http://localhost:4200
- Backend API: http://localhost:3000
- MinIO Console: http://localhost:9001 (admin/admin)

### Test Credentials
- Email: `admin@annotateme.com`
- Password: `password123`

---

## Local Development Setup

### 1. Backend Setup

```bash
cd packages/backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env if needed

# Start PostgreSQL (if not using Docker)
docker run -d -p 5432:5432 \
  -e POSTGRES_USER=annotateme \
  -e POSTGRES_PASSWORD=annotateme \
  -e POSTGRES_DB=annotateme \
  postgres:15-alpine

# Initialize database
npm run init-db

# Start development server
npm run dev
```

Backend runs on `http://localhost:3000`

### 2. Frontend Setup

```bash
cd packages/frontend

# Install dependencies
npm install

# Start development server
npm start
```

Frontend runs on `http://localhost:4200`

---

## Database Setup

### Option 1: Docker (Automatic)
```bash
docker-compose up -d postgres
```

### Option 2: Manual
```bash
cd packages/backend
./setup-db.sh
```

### Option 3: Direct
```bash
cd packages/backend
npm run migrate
npm run seed
```

---

## S3/Cloud Storage Setup

### Using AWS S3

1. Create AWS account and S3 bucket
2. Create IAM user with S3 permissions
3. Update `.env`:
```env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

### Using MinIO (Local)
Already configured in docker-compose.yml

Create bucket:
```bash
# Access MinIO console at http://localhost:9001
# Login: minioadmin / minioadmin
# Create bucket: annotateme-data
```

---

## Common Tasks

### Create Admin User
```bash
cd packages/backend
npm run seed
```

### View Database
```bash
psql -h localhost -U annotateme -d annotateme

# Common queries:
SELECT * FROM users;
SELECT * FROM projects;
SELECT * FROM annotations;
```

### View Logs
```bash
# Backend
docker logs annotateme_backend -f

# Frontend
docker logs annotateme_frontend -f

# Database
docker logs annotateme_db -f
```

### Stop Services
```bash
docker-compose down
```

### Reset Database
```bash
docker-compose down -v
docker-compose up -d
```

---

## Features

✅ User authentication (JWT)
✅ Multi-tenant organizations
✅ Project management
✅ Image/Text/Audio/Video annotation
✅ Real-time collaboration (ready for WebSockets)
✅ File upload to S3
✅ Format import/export:
  - COCO JSON
  - Pascal VOC
  - YOLO
  - CSV
  - JSON
✅ Analytics dashboard
✅ Role-based access control

---

## API Documentation

### Authentication
```bash
POST /api/auth/register
{
  "email": "user@example.com",
  "username": "user",
  "password": "password",
  "firstName": "John",
  "lastName": "Doe"
}

POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password"
}
```

### Projects
```bash
GET /api/projects                    # List projects
POST /api/projects                   # Create project
GET /api/projects/:id                # Get project
PATCH /api/projects/:id              # Update project
DELETE /api/projects/:id             # Delete project
```

### Annotations
```bash
POST /api/annotations                # Create annotation
GET /api/annotations/project/:projectId  # Get project annotations
PATCH /api/annotations/:id           # Update annotation
```

### Import/Export
```bash
POST /api/import-export/:projectId/upload          # Upload files
POST /api/import-export/:projectId/import          # Import annotations
GET /api/import-export/:projectId/export?format=coco  # Export
GET /api/import-export/:projectId/files            # List files
DELETE /api/import-export/:projectId/files/:fileId    # Delete file
```

### Analytics
```bash
GET /api/analytics/project/:projectId  # Get project analytics
POST /api/analytics                    # Record metric
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :3000
kill -9 <PID>
```

### Database Connection Error
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Verify connection
psql -h localhost -U annotateme -d annotateme
```

### CORS Errors
- Backend is running: `http://localhost:3000`
- Frontend is running: `http://localhost:4200`
- CORS is enabled in backend

### S3 Connection Issues
- Verify AWS credentials
- Check bucket exists
- Check IAM permissions
- For MinIO, ensure it's running and bucket exists

---

## Documentation

- [DATABASE_SETUP.md](./DATABASE_SETUP.md) - Database configuration & schema
- [S3_AND_FORMATS.md](./S3_AND_FORMATS.md) - S3 & dataset format guide
- [README.md](./README.md) - Full documentation

---

## Next Steps

1. ✅ Start application with `docker-compose up -d`
2. ✅ Login with admin credentials
3. ✅ Create a new project
4. ✅ Upload files
5. ✅ Create annotations
6. ✅ Export in your desired format

---

**Happy Annotating! 🎉**
