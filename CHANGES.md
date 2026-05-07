# AnnotateMe — Changes & Features

## Summary

A complete overhaul of the AnnotateMe prototype into a production-ready, CVAT-like data annotation platform.

---

## New Frontend (React + Vite — replaced Angular prototype)

### Architecture
- **React 18 + TypeScript** with Vite build tool
- **React Router v6** for client-side routing
- **Zustand** for global state management (auth + annotation state)
- **Axios** with JWT interceptor for API calls
- **CSS Modules / custom CSS** — no heavy UI framework

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Email/password login + register |
| Projects | `/projects` | Card grid of all projects |
| Project Detail | `/projects/:id` | Tasks list with inline job management |
| Jobs | `/jobs` | All jobs across all tasks |
| Annotation Editor | `/jobs/:id/annotate` | Full canvas annotation tool |
| Analytics | `/analytics` | Stats dashboard |
| Cloud Storage | `/cloud-storage` | Storage configuration UI |
| User Management | `/users` | Admin-only user management |

### Annotation Editor Features
- **Drawing tools**: Rectangle, Polygon, Polyline, Point, Ellipse
- **Selection tool**: Click to select, drag to move shapes
- **Zoom & Pan**: Mouse wheel zoom (centered on cursor), Ctrl+drag or middle-mouse pan
- **Undo/Redo**: Full history (Ctrl+Z / Ctrl+Y)
- **Frame navigation**: Previous/next, slider, frame number input, first/last buttons
- **Auto-save**: Annotations auto-saved 3 seconds after changes
- **Manual save**: Ctrl+S or Save button
- **Label colors**: Per-label color coding with semi-transparent fill
- **Objects panel**: List of all shapes with hide/delete controls
- **Labels panel**: Clickable label selector
- **Keyboard shortcuts**: R (rect), P (polygon), L (polyline), D (point), E (ellipse), S (select), Del (delete), Esc (cancel), F (fit to screen)
- **Real-time status bar**: Frame info, object count, zoom level

---

## New Backend Entities

### Task
- Belongs to a Project
- Has many Jobs
- Has many Files (uploaded images/video frames)
- Fields: `name`, `status` (annotation/validation/acceptance/completed), `subset` (Train/Test/Validation), `thumbnailUrl`, `frameCount`, `annotatedFrames`, `assigneeId`

### Job
- Belongs to a Task
- Fields: `stage` (annotation/validation/acceptance), `state` (new/in_progress/completed/rejected), `type` (annotation/ground_truth), `frameStart`, `frameEnd`, `assigneeId`

### Updated Entities
- **File**: Added `taskId`, `url`, `frameNumber` fields
- **Annotation**: Added `jobId`, `frameNumber`, `shapes` (JSON), `tags` (JSON), `tracks` (JSON) fields

---

## New Backend Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks?projectId=X` | List tasks (filter by project) |
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/:id` | Get task with jobs, files |
| PATCH | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task + cascade |
| GET | `/api/tasks/:id/jobs` | List jobs for task |
| POST | `/api/tasks/:id/jobs` | Create job for task |
| GET | `/api/jobs/:id` | Get job |
| PATCH | `/api/jobs/:id` | Update job (state, stage, assignee) |
| DELETE | `/api/jobs/:id` | Delete job |
| GET | `/api/jobs/:id/frame/:n` | Get annotations for frame N |
| POST | `/api/jobs/:id/frame/:n` | Save annotations for frame N |
| POST | `/api/files/upload` | Upload images/video (multipart) |
| GET | `/api/files/task/:taskId` | List files for task |
| GET | `/api/users/me` | Current user profile |
| GET | `/api/users` | All users (admin/manager) |
| PATCH | `/api/users/:id` | Update user role/status (admin) |
| DELETE | `/api/users/:id` | Delete user (admin) |

---

## Backend Improvements

- **WebSocket (Socket.io)**: Real-time annotation sync across multiple users on the same job
- **TypeORM sync**: `synchronize: true` auto-creates tables on startup
- **Connection pooling**: min 5, max 20 PostgreSQL connections
- **Static file serving**: `/uploads` path serves uploaded images
- **Auto-job creation**: Uploading files to a task auto-creates/updates a Job covering all frames
- **CORS**: Configurable via `ALLOWED_ORIGINS` env var

---

## Infrastructure

### Services (docker-compose.yml)
| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL 15 | 5432 | Primary database |
| Redis 7 | 6379 | Caching, rate limiting |
| MinIO | 9000/9001 | Object storage (S3-compatible) |
| Backend (Node.js) | 3000 | Express API + WebSocket |
| Frontend (Nginx) | 4200 | React SPA |
| Nginx (proxy) | 80 | Reverse proxy + rate limiting |

### Nginx Configuration
- Rate limiting: 30 req/s API, 5 req/min login endpoint
- Gzip compression for text/JS/CSS
- 1-year cache headers for static assets
- WebSocket proxy for Socket.io
- 500MB upload size limit

### Production (docker-compose.prod.yml)
- PostgreSQL tuned: 200 max connections, 512MB shared buffers
- Redis tuned: 512MB max memory, LRU eviction
- 2 backend replicas for horizontal scaling
- Log rotation configured
- Memory limits on all services
