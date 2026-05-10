import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import { AppDataSource } from "../database/data-source";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

// Label → colour map built from project labels; fall back to a deterministic palette.
const PALETTE = [
  "#E6194B", "#3CB44B", "#FFE119", "#4363D8", "#F58231",
  "#911EB4", "#42D4F4", "#F032E6", "#BFEF45", "#FABED4",
];
function labelColor(label: string, labelMap: Record<string, string>): string {
  if (labelMap[label]) return labelMap[label];
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// ── GET /api/ai/health ────────────────────────────────────────────────────────
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    const body = await resp.json();
    res.json({ status: "ok", aiService: body });
  } catch {
    res.status(503).json({ status: "unavailable", aiService: null });
  }
});

// ── POST /api/ai/annotate ─────────────────────────────────────────────────────
// Body: { jobId, frameIndex, confidenceThreshold? }
// Returns: { shapes: Shape[], model: string }
router.post("/annotate", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { jobId, frameIndex, confidenceThreshold } = req.body as {
    jobId: string;
    frameIndex: number;
    confidenceThreshold?: number;
  };

  if (!jobId || frameIndex == null) {
    res.status(400).json({ error: "jobId and frameIndex are required" });
    return;
  }

  try {
    // 1. Resolve taskId and project labels from the job
    const [jobRows, labelRows] = await Promise.all([
      AppDataSource.query(
        `SELECT j."taskId", t."projectId"
         FROM jobs j JOIN tasks t ON j."taskId" = t.id
         WHERE j.id = $1`,
        [jobId]
      ),
      AppDataSource.query(
        `SELECT l.name, l.color FROM labels l
         JOIN tasks t ON t."projectId" = l."projectId"
         JOIN jobs j ON j."taskId" = t.id
         WHERE j.id = $1`,
        [jobId]
      ),
    ]);

    if (!jobRows.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const { taskId } = jobRows[0];

    // Build label → colour map from project labels
    const labelMap: Record<string, string> = {};
    for (const row of labelRows) labelMap[row.name] = row.color;

    // 2. Find the file for this frame
    const fileRows = await AppDataSource.query(
      `SELECT url, "originalName" FROM files WHERE "taskId" = $1 AND "frameNumber" = $2 LIMIT 1`,
      [taskId, frameIndex]
    );

    if (!fileRows.length) {
      res.status(404).json({ error: `No file found for frame ${frameIndex}` });
      return;
    }

    const fileUrl: string = fileRows[0].url; // e.g. /uploads/frames_xxx/frame.jpg

    // 3. Read image from local filesystem (uploads directory)
    const relativePath = fileUrl.replace(/^\/uploads\//, "");
    const absPath = path.join(UPLOAD_DIR, relativePath);

    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: `Image file not found on disk: ${relativePath}` });
      return;
    }

    // 4. POST image to AI service
    const form = new FormData();
    form.append("file", fs.createReadStream(absPath), path.basename(absPath));
    if (confidenceThreshold != null) {
      form.append("confidence_threshold", String(confidenceThreshold));
    }

    const aiResp = await fetch(`${AI_SERVICE_URL}/predict`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
      signal: AbortSignal.timeout(30_000),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      res.status(502).json({ error: `AI service error: ${text}` });
      return;
    }

    const aiData = await aiResp.json() as {
      predictions: Array<{
        type: "rect" | "polygon";
        label: string;
        confidence: number;
        points: Array<{ x: number; y: number }>;
      }>;
      model: string;
    };

    // 5. Convert predictions to AnnotateMe Shape format
    const shapes = aiData.predictions.map((p) => ({
      id: uuidv4(),
      type: p.type,
      label: p.label,
      color: labelColor(p.label, labelMap),
      points: p.points,
      confidence: p.confidence,
      occluded: false,
      hidden: false,
      locked: false,
      attributes: {},
    }));

    res.json({ shapes, model: aiData.model, count: shapes.length });
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      res.status(504).json({ error: "AI service timed out" });
      return;
    }
    console.error("AI annotate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
