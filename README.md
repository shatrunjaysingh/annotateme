# AnnotateMe - Data Annotation & Labeling Platform

A comprehensive, production-ready data annotation and labeling platform with real-time collaboration, analytics, and multi-tenant support.

## Features

- **User Authentication & Management**
  - Multi-tenant support
  - Role-based access control (Admin, Manager, User)
  - JWT-based authentication

- **Project Management**
  - Create and manage annotation projects
  - Support for multiple data types (Image, Text, Audio, Video)
  - Customizable label sets
  - Project progress tracking

- **Data Annotation**
  - Interactive annotation interface
  - Multiple annotation tools (Rectangle, Polygon, Point)
  - Real-time collaboration
  - Batch processing capabilities

- **Collaboration Features**
  - Team project collaboration
  - Role-based permissions
  - Real-time updates via WebSockets

- **Analytics Dashboard**
  - Project completion metrics
  - Annotation statistics
  - Team performance tracking
  - Detailed analytics export

- **File Management**
  - Bulk file upload
  - Multiple file format support
  - Automatic file processing

## Tech Stack

### Backend
- Node.js + Express.js
- TypeORM (Database ORM)
- PostgreSQL
- JWT Authentication
- Socket.io (Real-time collaboration)

### Frontend
- Angular 16+
- TypeScript
- RxJS
- Chart.js (Analytics)

### Infrastructure
- Docker & Docker Compose
- PostgreSQL Database

## Project Structure

```
AnnotateMe/
├── packages/
│   ├── backend/          # Express API server
│   │   ├── src/
│   │   │   ├── database/
│   │   │   ├── entities/
│   │   │   ├── middlewares/
│   │   │   ├── routes/
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   └── frontend/         # Angular application
│       ├── src/
│       │   ├── app/
│       │   │   ├── components/
│       │   │   ├── services/
│       │   │   ├── interceptors/
│       │   │   └── app.module.ts
│       ├── Dockerfile
│       └── package.json
├── docker-compose.yml
└── README.md
```

## Installation & Setup

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- PostgreSQL (if running locally)

### Quick Start with Docker

1. **Clone the repository:**
```bash
cd AnnotateMe
```

2. **Start all services:**
```bash
docker-compose up -d
```

This will start:
- PostgreSQL database (port 5432)
- Backend API (port 3000)
- Frontend application (port 4200)

3. **Access the application:**
- Frontend: http://localhost:4200
- Backend API: http://localhost:3000
- Database: localhost:5432

### Local Development Setup

#### Backend

1. **Install dependencies:**
```bash
cd packages/backend
npm install
```

2. **Set environment variables:**
Create a `.env` file in `packages/backend`:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=annotateme
DB_PASSWORD=annotateme
DB_NAME=annotateme
NODE_ENV=development
JWT_SECRET=your_secret_key_here
PORT=3000
```

3. **Start PostgreSQL:**
```bash
docker run -d -p 5432:5432 \
  -e POSTGRES_USER=annotateme \
  -e POSTGRES_PASSWORD=annotateme \
  -e POSTGRES_DB=annotateme \
  postgres:15-alpine
```

4. **Run migrations and start server:**
```bash
npm run migrate
npm run dev
```

#### Frontend

1. **Install dependencies:**
```bash
cd packages/frontend
npm install
```

2. **Start development server:**
```bash
npm start
```

The frontend will be available at http://localhost:4200

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Projects
- `GET /api/projects` - List user's projects
- `POST /api/projects` - Create new project
- `GET /api/projects/:id` - Get project details
- `PATCH /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Annotations
- `POST /api/annotations` - Create annotation
- `GET /api/annotations/project/:projectId` - Get project annotations
- `PATCH /api/annotations/:id` - Update annotation

### Analytics
- `GET /api/analytics/project/:projectId` - Get project analytics
- `POST /api/analytics` - Record metric

## Database Schema

### Users
- id (UUID, PK)
- email (String, Unique)
- username (String)
- password (String, Hashed)
- role (Enum: admin, manager, user)
- firstName, lastName
- createdAt, updatedAt

### Projects
- id (UUID, PK)
- name (String)
- description (String)
- status (Enum: active, archived, completed)
- dataType (Enum: image, text, audio, video)
- labelSet (JSON Array)
- progress (Integer 0-100)
- createdBy (FK to Users)
- organization (FK to Organizations)
- createdAt, updatedAt

### Annotations
- id (UUID, PK)
- fileId (String)
- data (JSON)
- status (Enum: pending, in_progress, completed, rejected)
- confidence (Float)
- project (FK to Projects)
- createdAt, updatedAt

### Files
- id (UUID, PK)
- originalName (String)
- fileName (String)
- mimeType (String)
- size (Integer)
- path (String)
- status (Enum: pending, processing, completed, failed)
- project (FK to Projects)
- uploadedAt

### Collaborations
- id (UUID, PK)
- role (Enum: viewer, annotator, manager, admin)
- canEdit (Boolean)
- canDelete (Boolean)
- canInvite (Boolean)
- project (FK to Projects)
- user (FK to Users)
- joinedAt

### Analytics
- id (UUID, PK)
- metric (String)
- value (Number)
- details (JSON)
- project (FK to Projects)
- recordedAt

## Key Features Implementation

### 1. Multi-Tenant Support
- Organizations own projects
- Users can belong to multiple organizations
- Role-based permissions per organization

### 2. Real-Time Collaboration
- Socket.io integration for live updates
- Real-time annotation syncing
- Presence awareness

### 3. Role-Based Access Control
- Admin: Full system access
- Manager: Organization & team management
- User/Annotator: Limited to assigned projects
- Viewer: Read-only access

### 4. Analytics
- Project completion metrics
- Per-user performance tracking
- Annotation quality scores
- Timeline analytics

## Security Features

- JWT-based authentication with expiry
- Password hashing with bcryptjs
- CORS protection
- Role-based authorization
- Input validation

## Performance Optimizations

- Database indexing on frequently queried fields
- Connection pooling with TypeORM
- Frontend lazy loading
- API response caching
- Batch annotation processing

## Future Enhancements

- [ ] WebSocket real-time collaboration
- [ ] Advanced annotation tools (3D, Video frame-by-frame)
- [ ] ML model integration for auto-annotation
- [ ] Export to multiple formats (COCO, Pascal VOC, etc.)
- [ ] Advanced search and filtering
- [ ] Custom workflows
- [ ] Integration with cloud storage (S3, GCS)
- [ ] Mobile app
- [ ] Advanced reporting and dashboards

## Deployment

### Production Deployment with Docker

1. **Update environment variables** in docker-compose.yml:
```yaml
environment:
  NODE_ENV: production
  JWT_SECRET: your_production_secret
  DB_PASSWORD: strong_password
```

2. **Build and deploy:**
```bash
docker-compose -f docker-compose.yml up -d
```

### Kubernetes Deployment

Helm charts and Kubernetes manifests available in `k8s/` directory.

## Development Guidelines

### Code Style
- Use TypeScript strict mode
- Follow Angular style guide
- Use ESLint for code quality

### Testing
```bash
# Backend
cd packages/backend
npm test

# Frontend
cd packages/frontend
npm test
```

### Database Migrations
```bash
cd packages/backend
npm run typeorm migration:create -- -n YourMigrationName
npm run typeorm migration:run
```

## Troubleshooting

### Port Already in Use
```bash
# Change ports in docker-compose.yml or:
lsof -i :3000  # Find process using port
kill -9 <PID>  # Kill process
```

### Database Connection Issues
- Ensure PostgreSQL is running
- Verify credentials in .env file
- Check DATABASE_URL format

### CORS Errors
- Verify backend CORS configuration
- Ensure frontend URL is in allowed origins

## Contributing

1. Create feature branch
2. Make changes
3. Test locally
4. Submit pull request

## Support

For issues and questions, please open an issue on the repository.

---

**Created:** May 3, 2026
**Version:** 1.0.0
