import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import FormData from "form-data";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import { AppDataSource } from "../database/data-source";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const VIDEO_EXTS = new Set([".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"]);

/** Extract a single frame from a video as a PNG buffer using ffmpeg. */
function extractVideoFrame(videoPath: string, frameIndex: number): Buffer {
  // select=eq(n,N) picks exactly frame number N (0-based)
  return execFileSync("ffmpeg", [
    "-i", videoPath,
    "-vf", `select=eq(n\\,${frameIndex})`,
    "-vframes", "1",
    "-f", "image2pipe",
    "-vcodec", "png",
    "pipe:1",
  ], { maxBuffer: 50 * 1024 * 1024 }); // 50 MB max
}

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

// ── GET /api/ai/models ────────────────────────────────────────────────────────
router.get("/models", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${AI_SERVICE_URL}/models`, { signal: AbortSignal.timeout(5000) });
    const body = await resp.json();
    res.json(body);
  } catch {
    res.status(503).json({ error: "AI service unavailable" });
  }
});

// ── POST /api/ai/annotate ─────────────────────────────────────────────────────
// Body: { jobId, frameIndex, confidenceThreshold?, modelName? }
// Returns: { shapes: Shape[], model: string }
router.post("/annotate", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { jobId, frameIndex, confidenceThreshold, modelName, classes } = req.body as {
    jobId: string;
    frameIndex: number;
    confidenceThreshold?: number;
    modelName?: string;
    classes?: string; // comma-separated, for YOLO-World
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

    // 4. Read image (extract frame from video if needed)
    const ext = path.extname(absPath).toLowerCase();
    let imageBuffer: Buffer;
    let contentType: string;

    if (VIDEO_EXTS.has(ext)) {
      try {
        imageBuffer = extractVideoFrame(absPath, frameIndex);
        contentType = "image/png";
      } catch (err: any) {
        res.status(500).json({ error: `Failed to extract frame ${frameIndex} from video: ${err.message}` });
        return;
      }
    } else {
      imageBuffer = fs.readFileSync(absPath);
      contentType =
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" :
        "image/jpeg";
    }

    const form = new FormData();
    form.append("file", imageBuffer, {
      filename: path.basename(absPath),
      contentType,
      knownLength: imageBuffer.length,
    });
    if (confidenceThreshold != null) {
      form.append("confidence_threshold", String(confidenceThreshold));
    }
    form.append("model_name", modelName ?? "active");
    if (classes) form.append("classes", classes);

    const aiResp = await fetch(`${AI_SERVICE_URL}/predict`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
      signal: AbortSignal.timeout(300_000), // 5 min — SAM2/Grounded SAM download weights on first use
    });

    if (!aiResp.ok) {
      let errMsg = `AI service error (HTTP ${aiResp.status})`;
      try {
        const body = await aiResp.json() as any;
        errMsg = body.detail || body.error || errMsg;
      } catch {
        errMsg = (await aiResp.text()) || errMsg;
      }
      res.status(502).json({ error: errMsg });
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
      raw_count: number;
      filtered_count: number;
      note?: string;
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

    res.json({
      shapes,
      model: aiData.model,
      count: shapes.length,
      rawCount: aiData.raw_count,
      note: aiData.note ?? null,
    });
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError" || err.type === "aborted") {
      res.status(504).json({ error: "AI service timed out. Heavy models (SAM2, Grounded SAM) may take 1–3 minutes on first use while downloading weights. Please try again." });
      return;
    }
    console.error("AI annotate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
