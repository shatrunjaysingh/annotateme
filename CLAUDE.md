# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (`packages/frontend`)
```bash
npm run dev       # Vite dev server on port 4200
npm run build     # Production bundle to dist/
npm run preview   # Serve production build on port 4200
```

### Backend (`packages/backend`)
```bash
npm run dev       # ts-node + nodemon dev server on port 3000
npm run build     # tsc → dist/
npm run start     # Run compiled dist/index.js
npm run test      # Jest
npm run migrate   # Run TypeORM migrations (requires dist/ — build first)
npm run seed      # Seed initial data via ts-node src/seeds/seed.ts
npm run init-db   # migrate + seed in sequence
```

### Docker (from repo root)
```bash
docker compose up -d              # Start all services
docker compose -f docker-compose.prod.yml up -d   # Production
```

## Architecture

This is a **npm workspaces monorepo** with two packages:

```
packages/
  backend/    Node.js/Express REST API + Socket.io
  frontend/   React SPA (Vite)
```

Traffic in production flows through an **Nginx reverse proxy** (port 80) that routes `/api/*` and `/socket.io/*` to the backend (port 3000), and everything else to the frontend (port 4200 in dev, Nginx-served in prod).

### Data model hierarchy

```
Organization → Project → Task → Job → Annotation (per frame)
```

- **Project**: top-level grouping with a label schema; has a `dataType` (image, video, etc.)
- **Task**: a dataset (set of frames) within a project; has a `subset` (Train/Validation/Test)
- **Job**: a slice of a task assigned to a user for annotation; has `stage` (annotation/validation/acceptance) and `state` (new/in_progress/completed/rejected)
- **Annotation**: one row per frame per job; `shapes` column is a JSONB array of drawn shapes, each with a `label` field

### Backend (`packages/backend/src/`)

- **`index.ts`** — Express app bootstrap, Socket.io wiring, route registration, static `/uploads` serving
- **`database/data-source.ts`** — TypeORM DataSource; reads `DB_*` env vars, defaults to `localhost:5432/annotateme`
- **`entities/`** — TypeORM entities (one file per table)
- **`routes/`** — Thin Express routers; most business logic is inline SQL via `AppDataSource.query()`
- **`services/`** — Heavier logic: S3/MinIO integration (`s3.service.ts`, `storage.service.ts`), import/export format conversion (`format-converter.ts`, `extended-formats.ts`), label extraction
- **`middlewares/auth.ts`** — JWT verification; attaches `req.user` as `AuthRequest`
- **`migrations/`** — TypeORM migration files; run via `npm run migrate` after building

Key route modules: `auth`, `projects`, `tasks`, `jobs`, `users`, `files`, `annotations`, `analytics`, `import-export`, `labels`, `reports`.

Socket.io events: `join-job`, `leave-job`, `annotation-update`, `cursor-move` — used for real-time collaborative annotation.

### Frontend (`packages/frontend/src/`)

- **`api/client.ts`** — Axios instance; all API calls go through this
- **`store/`** — Zustand stores for global state
- **`pages/`** — One component per route; mostly self-contained with local state
  - `AnnotationEditor.tsx` — The core annotation UI; uses `AnnotationCanvas.tsx` for drawing
- **`components/AnnotationCanvas.tsx`** — Canvas-based shape drawing (bounding boxes, polygons, etc.)
- **`components/Navbar.tsx`** — Navigation; reads auth state from Zustand
- **`components/ProtectedRoute.tsx`** — Redirects unauthenticated users to `/login`

Routing is in `App.tsx` using React Router v6. All non-auth routes are wrapped in `ProtectedRoute`.

Vite dev proxy: `/api`, `/uploads`, and `/socket.io` are proxied to `http://localhost:3000`.

### Infrastructure

- **PostgreSQL 15** — primary database (default creds: `annotateme/annotateme`)
- **Redis 7** — referenced in env; available for caching/sessions
- **MinIO** — S3-compatible object storage (ports 9000/9001); AWS S3 also supported via `s3.service.ts`
- **Nginx** — rate-limited (30 req/s API, 5 req/min login), gzip, WebSocket passthrough, 1-year static asset cache

### Environment

Copy `.env.example` to `.env` in the repo root (Docker Compose reads it) and in `packages/backend/` for local dev. Required vars: `DB_*`, `JWT_SECRET`, `MINIO_*` (or AWS equivalents), `PORT`, `NODE_ENV`.

### TypeScript notes

- Backend: `strict: false`, decorators enabled (required for TypeORM `@Entity`, `@Column`, etc.)
- Frontend: `strict: true`, no emit (Vite compiles)
- Backend migrations must be run against compiled JS: build first, then `npm run migrate`
