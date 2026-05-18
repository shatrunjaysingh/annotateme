# AnnotateMe — Data Annotation & Labeling Platform

A production-ready, CVAT-inspired data annotation platform with multi-tenant support, real-time collaboration, AI-assisted annotation, and a full review workflow.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Feature Reference](#feature-reference)
   - [Annotation Editor](#annotation-editor)
   - [Object Tracking & Interpolation](#object-tracking--interpolation)
   - [Image Enhancement](#image-enhancement)
   - [Shape Attributes](#shape-attributes)
   - [Label Guidelines](#label-guidelines)
   - [Automated QA](#automated-qa)
   - [AI Auto-Annotation](#ai-auto-annotation)
   - [Review Workflow](#review-workflow)
   - [Audit Trail](#audit-trail)
   - [Analytics Dashboard](#analytics-dashboard)
   - [Webhooks](#webhooks)
   - [Active Learning](#active-learning)
   - [Time Tracking](#time-tracking)
   - [3D Point Cloud Annotation](#3d-point-cloud-annotation)
   - [Text Annotation](#text-annotation)
   - [Real-Time Collaboration](#real-time-collaboration)
   - [Multi-Tenant Support](#multi-tenant-support)
   - [Import / Export](#import--export)
5. [API Reference](#api-reference)
6. [Data Model](#data-model)
7. [Environment Variables](#environment-variables)
8. [Deployment](#deployment)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Zustand, React Router v6 |
| Backend | Node.js, Express, TypeScript, TypeORM |
| Database | PostgreSQL 15 |
| Realtime | Socket.io |
| Object Storage | MinIO (S3-compatible) / AWS S3 |
| AI Service | Python FastAPI + YOLOv8 |
| Proxy | Nginx |
| Cache | Redis 7 |

---

## Quick Start

### Docker (recommended)

```bash
git clone <repo>
cp .env.example .env          # fill in JWT_SECRET, MINIO_* etc.
docker compose up -d
```

| Service | URL |
|---|---|
| Application | http://localhost:80 |
| Frontend dev | http://localhost:4200 |
| Backend API | http://localhost:3000 |
| MinIO console | http://localhost:9001 |

Default admin credentials: `admin@annotateme.com` / `password123`

### Local Development

```bash
# Backend
cd packages/backend
cp .env.example .env
npm install
npm run dev          # ts-node + nodemon on port 3000

# Frontend
cd packages/frontend
npm install
npm run dev          # Vite on port 4200

# AI service (optional)
cd packages/ai
pip install -r requirements.txt
python3 -m uvicorn main:app --reload --port 8000
```

---

## Architecture

```
Organization → Project → Task → Job → Annotation (per frame)
```

- **Organization** — top-level tenant; users belong to one or more organizations
- **Project** — groups tasks under a shared label schema and data type
- **Task** — a dataset (set of image frames); belongs to one project
- **Job** — a slice of a task assigned to an annotator; tracks `stage` and `state`
- **Annotation** — one row per frame per job; stores shapes as JSONB

### Job lifecycle

```
stage:  annotation ──► validation ──► acceptance
state:  new → in_progress → completed / rejected
```

Validation and acceptance stages are admin/manager-only review passes. Rejected jobs return to the annotation stage.

---

## Feature Reference

### Annotation Editor

Full-featured canvas tool at `/jobs/:id/annotate`.

**Drawing tools**

| Tool | Key | Description |
|---|---|---|
| Select | S | Click to select, drag to move/resize |
| Rectangle | R | Two-corner bounding box |
| Polygon | P | Multi-point closed shape, double-click to finish |
| Polyline | L | Multi-point open path |
| Point | D | Single-pixel marker |
| Ellipse | E | Center + radius handle |

**Canvas controls**

- Mouse wheel — zoom (centered on cursor)
- Ctrl+drag or middle-mouse — pan
- F — fit image to canvas
- Ctrl+Z / Ctrl+Y — undo / redo (50-step history)
- Ctrl+S — manual save
- Del — delete selected shape
- Esc — cancel drawing / deselect
- 1–9 — assign label by index (number keys)

**Frame navigation**

- Arrow keys ← → — previous / next frame
- Home / End — first / last frame
- Frame number input — jump to any frame
- Play/pause button — auto-advance frames
- ±10 frame jump buttons

**Objects panel (right sidebar)**

- List of all shapes with label, color swatch, hide toggle, lock toggle, delete
- Sort by: ID ascending, ID descending, label, area
- Hide all / Show all / Lock all / Unlock all
- Copy all shapes to next frame

**Labels panel**

- Searchable label list (search bar appears when > 4 labels)
- Click to set active drawing label
- When a shape is selected, click a label to reassign it
- Number key shortcuts (1–9) per label position

---

### Object Tracking & Interpolation

Track any rectangular object across multiple frames with linear interpolation between keyframes.

**How to use**

1. Draw a rectangle on a frame
2. Select it → click **"Track this object across frames"** in the shape card
3. Navigate to another frame and reposition the box — it becomes a new keyframe
4. Frames between keyframes automatically show the interpolated position

**Tracks panel** (Objects tab, right sidebar)

- Lists all active tracks with keyframe count and color indicator
- Jump-to-first-keyframe button per track
- Delete track button removes all keyframes and interpolated shapes
- Purple indicator on the shape card shows whether the current frame is a keyframe or interpolated

**Data storage**

Tracks are stored on the Job entity (`GET/PUT /api/jobs/:id/tracks`). Each track record:

```json
{
  "id": "abc123",
  "label": "Car",
  "color": "#1890ff",
  "keyframes": {
    "0":  { "points": [{"x":10,"y":20},{"x":100,"y":80}], "occluded": false },
    "30": { "points": [{"x":50,"y":25},{"x":140,"y":85}] }
  }
}
```

---

### Image Enhancement

Adjust brightness, contrast, and saturation per-frame without modifying the original file. Applied via CSS `filter` on the canvas wrapper so it does not affect annotation coordinate space.

**How to use**: Click the ☀ (sun) icon in the top toolbar → sliders appear in the bottom-left of the canvas.

| Control | Range | Default |
|---|---|---|
| Brightness | 30 – 220% | 100% |
| Contrast | 30 – 220% | 100% |
| Saturation | 0 – 220% | 100% |

The toolbar icon turns blue when any filter is active. A **Reset** button returns all sliders to 100%.

---

### Shape Attributes

Every selected shape shows an attribute card with:

**Quick flags** (always present)
- Occluded — object is partially hidden by another object
- Truncated — object extends beyond the image border

**Label-defined attributes** — pulled from the label schema configured in Project Settings. Supported input types:

| Type | UI control |
|---|---|
| `checkbox` | Toggle checkbox |
| `select` / `radio` | Dropdown selector |
| `number` | Numeric input |
| `text` | Free-text input |

Attributes are stored in `shape.attributes` (JSONB) and exported with the annotations.

**Configuring attributes**

In Project Settings → Labels, each label can have an attributes array:

```json
[{
  "name": "color",
  "input_type": "select",
  "values": ["red", "blue", "green"],
  "default_value": "red",
  "mutable": true
}]
```

---

### Label Guidelines

Add annotation instructions directly to each label. When a label has a `description` set, it appears inline below the label name in the Labels tab — annotators see the rules without leaving the editor.

**Set a description**: Project Settings → Labels → edit label → Description field.

The description appears with a ⓘ indicator icon and is shown for every annotator working on that project.

---

### Automated QA

Real-time quality check that runs on every shape change in the current frame.

**Issues detected**

| Issue | Condition |
|---|---|
| Overlapping shapes | IoU > 0.5 between any two visible shapes |
| Tiny shape | Bounding box width or height < 8px |

**How to use**: The **QA** button in the top toolbar shows a green ✓ when clean, or a red count of issues. Click it to open the QA panel:
- Each issue listed with type and description
- "Select" button — jumps to the offending shape

---

### AI Auto-Annotation

Automatically annotate frames using a YOLOv8 model running in the Python AI service.

**Single frame**: Click **AI Annotate** in the toolbar. Shapes are merged non-destructively (existing shapes are preserved unless you re-run on the same frame).

**Batch annotation**: Menu → Batch AI Annotate — annotates all frames in the job sequentially with a progress indicator.

**Model selection**: Choose from available models in the AI panel (gear icon next to AI Annotate):
- Default: YOLOv8s-seg (general objects, COCO classes)
- Fine-tuned: upload your own weights to `packages/ai/` and configure `model.py`
- Confidence threshold: adjustable slider (default 0.15)

**Fine-tuning on your data**

```bash
# 1. Export annotations from AnnotateMe (COCO format)
# 2. Run fine-tuning
cd packages/ai
python3 train.py train --data annotations.json --images ./images --epochs 50

# 3. Switch to fine-tuned weights in model.py:
active_model = ProductionModel(weights="runs/segment/train/weights/best.pt")
```

---

### Review Workflow

Three-stage review process for quality assurance:

```
Annotator           Validator            Supervisor
    │                   │                    │
annotation ──Submit──► validation ──Approve──► acceptance ──Accept──► completed
               │                    │
            Reject               Reject
               └──────────────────┘
                (returns to annotation)
```

**States per stage**

| Stage | State | Meaning |
|---|---|---|
| annotation | new | Assigned but not started |
| annotation | in_progress | Being annotated |
| annotation | completed | Annotator submitted for review |
| validation | new | Awaiting validator |
| validation | completed | Validator approved |
| acceptance | new | Awaiting final sign-off |
| acceptance | completed | Fully accepted ✓ |
| any | rejected | Sent back with review note |

**Review banner** (annotation editor)

- Admins/managers see the annotator name, validator name (if validated), annotation summary (frame count, shape count), and Approve / Request Changes buttons
- Annotators see a locked notice when the job is in review
- Fully accepted jobs show a green "Fully Accepted" banner with the complete approval chain (annotator → validator → acceptor)

---

### Audit Trail

Every change to tasks and jobs is recorded in append-only audit tables.

**Events tracked**

| Entity | Actions |
|---|---|
| Task | created, updated, deleted, job_added |
| Job | created, updated, deleted, stage_changed, state_changed, assigned, annotation_saved, annotations_cleared |

Each entry records: who made the change, when, what changed (field-level diffs with `from` / `to` values), and optional notes.

**Viewing audit logs**

- **In the Annotation Editor**: click the **Audit** tab in the right sidebar — scrollable timeline with color-coded dots, action labels, timestamps, and before/after diff chips
- **In the Jobs page**: three-dot menu → **View audit trail** — modal with paginated log

**API**

```
GET /api/audits/jobs/:jobId?limit=50&offset=0
GET /api/audits/tasks/:taskId?includeJobs=true&limit=50&offset=0
```

---

### Analytics Dashboard

At `/analytics`. Project-level charts powered by real database queries.

**Global stats**
- Total projects, tasks, jobs
- Completed jobs count
- Overall completion rate

**Per-project charts** (select project from dropdown)

| Chart | Description |
|---|---|
| Label Distribution | Horizontal bar chart — shape count per label class |
| Annotator Leaderboard | Top 10 contributors ranked by shapes annotated; shows frame count and shape count |
| Annotation Velocity | 30-day sparkline of annotation saves per day; shows total saves and daily average |
| Job Status Breakdown | Count of new / in-progress / completed / rejected jobs |

**API endpoints**

```
GET /api/analytics/class-distribution/:projectId
GET /api/analytics/leaderboard/:projectId
GET /api/analytics/velocity/:projectId
GET /api/analytics/summary/:projectId
```

Grafana integration is also available — if Grafana is running, the dashboard page shows the live iframe instead.

---

### Webhooks

Receive HTTP POST notifications when jobs change state. Admin-only, managed at `/webhooks`.

**Supported events**

| Event | Trigger |
|---|---|
| `job.completed` | Job state changes to `completed` |
| `job.rejected` | Job state changes to `rejected` |
| `job.stage_changed` | Job moves between annotation / validation / acceptance |

**Payload format**

```json
{
  "event": "job.completed",
  "timestamp": "2026-05-17T12:00:00.000Z",
  "payload": {
    "jobId": "...",
    "taskId": "...",
    "stage": "acceptance",
    "state": "completed",
    "assigneeId": "..."
  }
}
```

**Signature verification**: If a secret is configured, every delivery includes an `X-Signature: sha256=<hmac>` header (HMAC-SHA256 of the JSON body using your secret).

**API**

```
GET    /api/webhooks
POST   /api/webhooks     { url, events[], secret?, projectId? }
PATCH  /api/webhooks/:id    (toggles active)
DELETE /api/webhooks/:id
```

---

### Active Learning

Prioritize frames where the AI model is least confident, so human annotators focus where they add the most value.

**How it works**

When AI auto-annotation runs on a frame, the minimum confidence score across all predicted shapes is recorded for that frame. The **Uncertain** button in the toolbar (appears when Smart Order is enabled in the Tracks panel) jumps to the frame with the lowest recorded confidence.

**Smart Order toggle** — in the Tracks panel header of the Objects tab. When enabled, activates the Uncertain jump button and can be used to build uncertainty-first annotation queues.

---

### Time Tracking

Every frame save records the time spent on that frame (milliseconds from when you navigated to the frame to when the save occurred). This appears in the job audit trail:

```
Frame 5: 3 shapes saved, 47s
```

Time data is preserved in the audit log and can be used to compute annotator speed metrics.

---

### 3D Point Cloud Annotation

For projects with `dataType = pointcloud`:

- Renders `.pcd` files using a custom Three.js-based PointCloudCanvas
- Draw 3D cuboids with the Cuboid tool
- Keyboard nudging: U/J (Y-axis), I/K (Z-axis), O/L (X-axis); hold Shift for ×5 step
- Expanded views: top, side, front orthographic projections
- Cuboid data saved in the `cuboids` field alongside shapes

---

### Text Annotation

For projects with `dataType = text` or `dataType = csv`:

- Renders text content from uploaded `.txt` or `.csv` files
- Text span annotation: highlight text ranges and assign labels
- TextAnnotationCanvas component handles selection and span rendering
- Spans stored in `annotation.textSpans`

---

### Real-Time Collaboration

Multiple annotators can work on the same job simultaneously.

- **Socket.io** events: `join-job`, `leave-job`, `annotation-update`, `cursor-move`
- Shape changes broadcast to all clients in the same job room
- Cursor positions of other annotators visible on canvas
- Automatic conflict resolution: last write wins per frame

---

### Multi-Tenant Support

- Organizations (tenants) are top-level isolation boundaries
- Users can belong to multiple organizations
- Admins can switch active tenant via the org dropdown in the navbar
- All data queries are scoped to the active tenant
- Super-admin view shows cross-tenant analytics

**Roles**

| Role | Permissions |
|---|---|
| admin | Full access: users, projects, tasks, jobs, webhooks, review |
| manager | Projects, tasks, jobs, review (validation + acceptance) |
| user | Assigned jobs only; cannot access review controls |

---

### Import / Export

**Export formats** (Project → Export)

| Format | Extension | Notes |
|---|---|---|
| AnnotateMe JSON | `.json` | Native format with full shape data |
| COCO JSON | `.json` | Detection + segmentation |
| Pascal VOC | `.zip` | Per-image XML files |
| YOLO | `.zip` | Per-image `.txt` label files |
| CVAT XML | `.xml` | Compatible with CVAT import |
| Label Studio JSON | `.json` | Compatible with Label Studio |
| Datumaro JSON | `.json` | Intel Geti / Datumaro compatible |
| TensorFlow Record | `.tfrecord` | Ready for TF object detection API |
| MOT CSV | `.csv` | Multi-object tracking format |

**Import**: Menu → Upload annotations (in the annotation editor) — accepts AnnotateMe JSON format.

---

## API Reference

### Authentication

```
POST /api/auth/login          { email, password } → { token, user, tenants }
POST /api/auth/register       { email, username, password }
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

### Projects

```
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
GET    /api/projects/:id/progress
```

### Tasks

```
GET    /api/tasks?projectId=X
POST   /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
GET    /api/tasks/:id/jobs
POST   /api/tasks/:id/jobs
```

### Jobs

```
GET    /api/jobs/:id
PATCH  /api/jobs/:id
DELETE /api/jobs/:id
GET    /api/jobs/:id/frame/:n
POST   /api/jobs/:id/frame/:n    { shapes, cuboids, tags, tracks, timeSpentMs }
GET    /api/jobs/:id/tracks
PUT    /api/jobs/:id/tracks       { tracks[] }
GET    /api/jobs/:id/export
DELETE /api/jobs/:id/annotations
```

### Labels

```
GET  /api/labels/:projectId       → { labels[] } with attributes + descriptions
POST /api/labels/:projectId
```

### Files

```
POST /api/files/upload
GET  /api/files/task/:taskId
GET  /api/files/:id/text          (text/csv files)
GET  /api/files/:id/points        (PCD point cloud)
```

### Analytics

```
GET /api/analytics/class-distribution/:projectId
GET /api/analytics/leaderboard/:projectId
GET /api/analytics/velocity/:projectId
GET /api/analytics/summary/:projectId
```

### Audit

```
GET /api/audits/tasks/:taskId?includeJobs=true&limit=50&offset=0
GET /api/audits/jobs/:jobId?limit=50&offset=0
```

### Webhooks (admin only)

```
GET    /api/webhooks
POST   /api/webhooks
PATCH  /api/webhooks/:id
DELETE /api/webhooks/:id
```

### AI

```
GET  /api/ai/health
GET  /api/ai/models
POST /api/ai/annotate    { jobId, frameIndex, confidenceThreshold, modelName, classes }
```

---

## Data Model

### Shape (stored as JSONB in `annotations.shapes`)

```typescript
interface Shape {
  id: string;           // UUID
  type: 'rect' | 'polygon' | 'point' | 'polyline' | 'ellipse';
  label: string;
  color: string;        // hex e.g. "#1890ff"
  points: { x: number; y: number }[];  // image pixel coordinates
  confidence?: number;  // 0–1, set by AI model
  occluded?: boolean;
  hidden?: boolean;
  locked?: boolean;
  attributes?: Record<string, string | number | boolean>;
  trackId?: string;     // links shape to an object track
  isInterpolated?: boolean;  // true = auto-generated, false = keyframe
}
```

**Point layout by shape type**

| Type | points array |
|---|---|
| rect | `[topLeft, bottomRight]` — 2 points |
| polygon / polyline | 3+ ordered contour points |
| point | 1 point |
| ellipse | `[centre, radiusPoint]` — 2 points |

### Track (stored as JSON on `jobs.tracks`)

```typescript
interface Track {
  id: string;
  label: string;
  color: string;
  keyframes: Record<frameNumber, {
    points: { x: number; y: number }[];
    occluded?: boolean;
    attributes?: Record<string, unknown>;
  }>;
}
```

---

## Environment Variables

Copy `.env.example` to `.env` in the repo root (Docker Compose) and in `packages/backend/` (local dev).

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `annotateme` | PostgreSQL user |
| `DB_PASSWORD` | `annotateme` | PostgreSQL password |
| `DB_NAME` | `annotateme` | PostgreSQL database |
| `JWT_SECRET` | — | Required. Sign JWT tokens |
| `PORT` | `3000` | Backend listen port |
| `MINIO_ENDPOINT` | `localhost` | MinIO / S3 host |
| `MINIO_PORT` | `9000` | MinIO port |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `annotateme` | Bucket name |
| `AWS_REGION` | — | Set for AWS S3 instead of MinIO |
| `AI_SERVICE_URL` | `http://localhost:8000` | Python AI service URL |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins |

---

## Deployment

### Production Docker Compose

```bash
docker compose -f docker-compose.prod.yml up -d
```

Production compose includes:
- PostgreSQL tuned: 200 max connections, 512MB shared buffers
- Redis: 512MB max memory, LRU eviction
- 2 backend replicas
- Log rotation
- Memory limits on all services

### Environment checklist

- [ ] `JWT_SECRET` — use a random 64-character string
- [ ] `DB_PASSWORD` — strong, unique password
- [ ] `MINIO_*` — or AWS S3 equivalents
- [ ] `NODE_ENV=production`
- [ ] Nginx SSL termination configured

### Upgrading

TypeORM runs with `synchronize: true` in development — new entities and columns are auto-created on restart. For production, generate and run migrations:

```bash
cd packages/backend
npm run build
npm run migrate
```

---

## Running Tests

```bash
# Backend unit tests
cd packages/backend && npm test

# E2E tests (Playwright)
cd packages/e2e
node_modules/.bin/playwright test

# E2E headed (browser visible)
node_modules/.bin/playwright test --headed
```

E2E tests cover: auth flows, project CRUD, label management, annotation tool switching, canvas drawing, and save.

---

*Version: 2.0 — May 2026*
