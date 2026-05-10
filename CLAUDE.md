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

### AI Service (`packages/ai`)
```bash
# Start inference server (port 8000)
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Install dependencies
pip install -r requirements.txt

# Fine-tune on exported AnnotateMe data
python3 train.py train --data annotations.json --images ./images --epochs 50

# Evaluate a trained model
python3 train.py eval --weights runs/segment/train/weights/best.pt \
                      --data annotations.json --images ./images
```

### E2E Tests (`packages/e2e`)
```bash
# Run all tests headless
node_modules/.bin/playwright test

# Run headed (browser visible)
node_modules/.bin/playwright test --headed

# Run a single spec
node_modules/.bin/playwright test tests/projects.spec.ts
```

### Docker (from repo root)
```bash
docker compose up -d              # Start all services (includes AI service on port 8000)
docker compose -f docker-compose.prod.yml up -d   # Production
```

## Architecture

This is an **npm workspaces monorepo** with three packages plus a Python AI service:

```
packages/
  backend/    Node.js/Express REST API + Socket.io
  frontend/   React SPA (Vite)
  e2e/        Playwright end-to-end tests
  ai/         Python FastAPI inference service (YOLOv8)
```

Traffic in production flows through an **Nginx reverse proxy** (port 80) that routes `/api/*` and `/socket.io/*` to the backend (port 3000), and everything else to the frontend (port 4200 in dev, Nginx-served in prod). The AI service runs independently on port 8000 and is only called server-side by the backend.

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

Key route modules: `auth`, `projects`, `tasks`, `jobs`, `users`, `files`, `annotations`, `analytics`, `import-export`, `labels`, `reports`, **`ai`**.

Socket.io events: `join-job`, `leave-job`, `annotation-update`, `cursor-move` — used for real-time collaborative annotation.

### AI Route (`packages/backend/src/routes/ai.ts`)

Two endpoints, both require JWT auth:

- **`GET /api/ai/health`** — proxies a health check to the AI service; returns `{ status, aiService }`.
- **`POST /api/ai/annotate`** — body: `{ jobId, frameIndex, confidenceThreshold? }`.
  1. Resolves the job → task → file URL from the DB.
  2. If the file is a video (`.mp4`, `.avi`, `.mov`, etc.), extracts the requested frame as PNG using `ffmpeg` (`select=eq(n,N)` filter).
  3. POSTs the image buffer to `AI_SERVICE_URL/predict` (env var, defaults to `http://localhost:8000`).
  4. Converts predictions into `Shape[]` objects (UUID ids, colours looked up from project labels).
  5. Returns `{ shapes, model, count }` — does **not** auto-save; the editor merges them.

Depends on: `node-fetch@2` (CommonJS compatible), `form-data`.

### Frontend (`packages/frontend/src/`)

- **`api/client.ts`** — Axios instance; all API calls go through this. The 401 interceptor redirects to `/login` **except** for `/auth/` routes (so login errors display in-form instead of looping).
- **`store/`** — Zustand stores for global state
- **`pages/`** — One component per route; mostly self-contained with local state
  - `AnnotationEditor.tsx` — The core annotation UI; includes the **AI Annotate** button in the top toolbar (calls `POST /api/ai/annotate`, merges returned shapes non-destructively).
- **`components/AnnotationCanvas.tsx`** — Canvas-based shape drawing (bounding boxes, polygons, etc.)
- **`components/Navbar.tsx`** — Navigation; reads auth state from Zustand
- **`components/ProtectedRoute.tsx`** — Redirects unauthenticated users to `/login`
- **`components/Toast.tsx`** — `ToastProvider` + `useToast()` hook (`success`, `error`, `warning`, `info`)
- **`components/ConfirmDialog.tsx`** — `ConfirmProvider` + `useConfirm()` returning `Promise<boolean>`; replaces all `window.confirm()` calls

Both `ToastProvider` and `ConfirmProvider` wrap the app in `main.tsx`.

Routing is in `App.tsx` using React Router v6. All non-auth routes are wrapped in `ProtectedRoute`.

Vite dev proxy: `/api`, `/uploads`, and `/socket.io` are proxied to `http://localhost:3000`.

### Shape format

Shapes are stored as JSONB in the `annotations` table and passed between all layers in this format:

```typescript
interface Shape {
  id: string;           // UUID
  type: 'rect' | 'polygon' | 'point' | 'polyline' | 'ellipse';
  label: string;
  color: string;        // hex
  points: { x: number; y: number }[];  // image pixel coordinates
  confidence?: number;  // 0–1, set by AI model
  occluded?: boolean;
  hidden?: boolean;
  locked?: boolean;
  attributes?: Record<string, string | number | boolean>;
}
```

- `rect` → exactly 2 points: `[topLeft, bottomRight]`
- `polygon` / `polyline` → 3+ ordered contour points
- `point` → 1 point
- `ellipse` → 2 points: `[centre, radiusPoint]`

### AI Service (`packages/ai/`)

A standalone **Python FastAPI** server that accepts image uploads and returns predictions.

**Files:**
- **`model.py`** — model definitions and the `active_model` singleton:
  - `BaseAnnotationModel` — abstract base; implement `predict(PIL.Image) -> list[Prediction]`
  - `ProductionModel` — wraps a YOLOv8-seg checkpoint; default `yolov8s-seg.pt` (24 MB, auto-downloads). Returns both `rect` and `polygon` per detection. Polygon contours are simplified with Ramer–Douglas–Peucker.
  - `MockModel` — returns random shapes; no ML dependencies; useful for testing the pipeline.
  - `CustomModel` — stub; implement `__init__` and `predict` to plug in any architecture.
- **`main.py`** — FastAPI app; `POST /predict` (multipart image) → `{ predictions, model, image_width, image_height }`; `GET /health`.
- **`train.py`** — fine-tuning pipeline:
  - Converts AnnotateMe COCO JSON export → YOLO segmentation dataset (train/val split, `dataset.yaml`)
  - Calls `YOLO.train()` with sensible augmentation defaults
  - `eval` subcommand reports mAP50 / mAP50-95 (box + mask)

**Prediction format** (returned by `POST /predict` and passed through the backend):
```json
{ "type": "rect"|"polygon", "label": "car", "confidence": 0.72,
  "points": [{"x": 120.0, "y": 45.0}, ...] }
```
Points are in **image pixel coordinates** (not normalised).

**Switching models** — edit the last line of `model.py`:
```python
active_model = ProductionModel()                                          # yolov8s-seg, conf=0.15
active_model = ProductionModel(weights="yolov8n-seg.pt", conf=0.15)      # nano, fastest
active_model = ProductionModel(weights="yolov8l-seg.pt", conf=0.15)      # large, most accurate
active_model = ProductionModel(weights="runs/segment/train/weights/best.pt")  # your fine-tuned
active_model = MockModel()                                                # no ML deps
```

**Important:** YOLOv8 is trained on real photographs (COCO dataset). It will return 0 detections on synthetic/cartoon images. Fine-tune with `train.py` if your data is domain-specific.

**Environment variables:**
- `AI_SERVICE_URL` (backend) — URL of the AI service; default `http://localhost:8000`; set to `http://ai-service:8000` in Docker Compose
- `CONFIDENCE_THRESHOLD` (AI service) — default minimum confidence; default `0.15`
- `MAX_DETECTIONS` (AI service) — cap on predictions per image; default `100`

### Infrastructure

- **PostgreSQL 15** — primary database (default creds: `annotateme/annotateme`)
- **Redis 7** — referenced in env; available for caching/sessions
- **MinIO** — S3-compatible object storage (ports 9000/9001); AWS S3 also supported via `s3.service.ts`
- **Nginx** — rate-limited (30 req/s API, 5 req/min login), gzip, WebSocket passthrough, 1-year static asset cache
- **AI Service** — Python FastAPI on port 8000; containerised via `packages/ai/Dockerfile`

### Environment

Copy `.env.example` to `.env` in the repo root (Docker Compose reads it) and in `packages/backend/` for local dev. Required vars: `DB_*`, `JWT_SECRET`, `MINIO_*` (or AWS equivalents), `PORT`, `NODE_ENV`.

AI-related vars (optional, have defaults): `AI_SERVICE_URL`, `CONFIDENCE_THRESHOLD`, `MAX_DETECTIONS`.

### TypeScript notes

- Backend: `strict: false`, decorators enabled (required for TypeORM `@Entity`, `@Column`, etc.)
- Frontend: `strict: true`, no emit (Vite compiles)
- Backend migrations must be run against compiled JS: build first, then `npm run migrate`
- `node-fetch` must stay at v2 in the backend — v3 is ESM-only, incompatible with CommonJS output

### E2E tests (`packages/e2e/`)

29 Playwright tests across 5 files. Run via the local binary (`node_modules/.bin/playwright test`), not `npx playwright` — the monorepo root may resolve a different version.

- `global.setup.ts` — logs in as `admin@annotateme.com` / `password123`, saves storage state to `.auth/user.json`
- `auth.spec.ts` — login/logout flows; clears storage state per test; uses `data-testid="login-error"` on the Login error div
- `projects.spec.ts` — project CRUD; uses `aria-label="Project options"` on the context menu button
- `labels.spec.ts` — label add/delete; uses `getByRole('heading', { name: 'Add Label' })` to avoid strict-mode collision with the button
- `annotation.spec.ts` — tool switching, save, canvas drawing; creates a throwaway project/task/job via API in `beforeAll`
