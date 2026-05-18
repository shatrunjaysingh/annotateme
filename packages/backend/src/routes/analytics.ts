import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Analytics } from "../entities/Analytics";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const analyticsRepository = AppDataSource.getRepository(Analytics);

router.get("/project/:projectId", async (req: AuthRequest, res) => {
  try {
    const analytics = await analyticsRepository.find({
      where: { project: { id: req.params.projectId } },
    });

    const summary = {
      totalMetrics: analytics.length,
      metrics: analytics.reduce((acc, a) => {
        acc[a.metric] = a.value;
        return acc;
      }, {} as Record<string, number>),
      details: analytics,
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { metric, value, projectId, details } = req.body;

    const analytics = analyticsRepository.create({
      metric,
      value,
      details,
      project: { id: projectId } as any,
    });

    await analyticsRepository.save(analytics);
    res.status(201).json(analytics);
  } catch (error) {
    res.status(500).json({ error: "Failed to record analytics" });
  }
});

// GET /api/analytics/class-distribution/:projectId
// Returns label → shape count for all annotations in the project
router.get("/class-distribution/:projectId", async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const rows = await AppDataSource.query(`
      SELECT shape->>'label' AS label, COUNT(*)::int AS count
      FROM annotations a
      JOIN jobs j ON j.id::text = a."jobId"
      JOIN tasks t ON t.id = j."taskId"
      CROSS JOIN LATERAL json_array_elements(a.shapes) AS shape
      WHERE t."projectId" = $1::uuid
        AND a.shapes IS NOT NULL
        AND json_array_length(a.shapes) > 0
      GROUP BY shape->>'label'
      ORDER BY count DESC
    `, [projectId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch class distribution" });
  }
});

// GET /api/analytics/leaderboard/:projectId
// Returns top annotators ranked by number of shapes annotated
router.get("/leaderboard/:projectId", async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const rows = await AppDataSource.query(`
      SELECT
        u.id,
        u.username,
        COUNT(DISTINCT a.id)::int AS frames,
        COALESCE(SUM(json_array_length(a.shapes)), 0)::int AS shapes
      FROM annotations a
      JOIN jobs j ON j.id::text = a."jobId"
      JOIN tasks t ON t.id = j."taskId"
      JOIN users u ON u.id = j."assigneeId"
      WHERE t."projectId" = $1::uuid
        AND a.shapes IS NOT NULL
      GROUP BY u.id, u.username
      ORDER BY shapes DESC
      LIMIT 10
    `, [projectId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/analytics/velocity/:projectId
// Returns daily annotation save counts for the past 30 days
router.get("/velocity/:projectId", async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const rows = await AppDataSource.query(`
      SELECT
        DATE(ja."createdAt") AS date,
        COUNT(*)::int AS saves
      FROM job_audits ja
      JOIN jobs j ON j.id = ja."jobId"
      JOIN tasks t ON t.id = j."taskId"
      WHERE t."projectId" = $1
        AND ja.action = 'annotation_saved'
        AND ja."createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(ja."createdAt")
      ORDER BY date ASC
    `, [projectId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch velocity" });
  }
});

// GET /api/analytics/summary/:projectId
// Returns job-state breakdown + task count for a specific project
router.get("/summary/:projectId", async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const rows = await AppDataSource.query(`
      SELECT j.state, COUNT(*)::int AS count
      FROM jobs j
      JOIN tasks t ON t.id = j."taskId"
      WHERE t."projectId" = $1
      GROUP BY j.state
    `, [projectId]);
    const [taskRow] = await AppDataSource.query(`SELECT COUNT(*)::int AS count FROM tasks WHERE "projectId" = $1`, [projectId]);
    const jobMap: Record<string, number> = { new: 0, in_progress: 0, completed: 0, rejected: 0 };
    for (const r of rows) jobMap[r.state] = r.count;
    const total = Object.values(jobMap).reduce((s, v) => s + v, 0);
    res.json({ tasks: taskRow.count, jobs: { ...jobMap, total } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// GET /api/analytics/quality/:projectId
// Per-annotator quality scores: annotation completeness + avg confidence vs ground truth shapes
router.get("/quality/:projectId", async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;

    // Count GT shapes per frame (ground_truth jobs in this project)
    const gtRows = await AppDataSource.query(`
      SELECT
        a."frameNumber",
        COALESCE(json_array_length(a.shapes), 0)::int AS gt_shapes
      FROM annotations a
      JOIN jobs j ON j.id::text = a."jobId"
      JOIN tasks t ON t.id = j."taskId"
      WHERE t."projectId" = $1::uuid
        AND j.type = 'ground_truth'
        AND a.shapes IS NOT NULL
    `, [projectId]);

    const gtTotal = gtRows.reduce((s: number, r: any) => s + r.gt_shapes, 0);

    // Per annotator: frames annotated, shapes annotated, avg confidence from AI shapes
    const annotatorRows = await AppDataSource.query(`
      SELECT
        u.id AS user_id,
        u.username,
        COUNT(DISTINCT a.id)::int AS frames_annotated,
        COALESCE(SUM(json_array_length(a.shapes)), 0)::int AS total_shapes,
        COALESCE(AVG(a.confidence), 0) AS avg_confidence
      FROM annotations a
      JOIN jobs j ON j.id::text = a."jobId"
      JOIN tasks t ON t.id = j."taskId"
      JOIN users u ON u.id = j."assigneeId"
      WHERE t."projectId" = $1::uuid
        AND j.type = 'annotation'
        AND a.shapes IS NOT NULL
      GROUP BY u.id, u.username
      ORDER BY total_shapes DESC
    `, [projectId]);

    res.json({
      gt_shape_count: gtTotal,
      gt_frame_count: gtRows.length,
      annotators: annotatorRows.map((r: any) => ({
        ...r,
        avg_confidence: Math.round(parseFloat(r.avg_confidence) * 100),
        coverage_pct: gtTotal > 0 ? Math.min(100, Math.round((r.total_shapes / gtTotal) * 100)) : null,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch quality metrics" });
  }
});

export default router;
