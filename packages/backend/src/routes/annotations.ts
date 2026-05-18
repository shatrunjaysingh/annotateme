import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Annotation } from "../entities/Annotation";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const annotationRepository = AppDataSource.getRepository(Annotation);

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { fileId, data, notes, projectId } = req.body;

    const annotation = annotationRepository.create({
      fileId,
      data,
      notes,
      project: { id: projectId } as any,
    });

    await annotationRepository.save(annotation);
    res.status(201).json(annotation);
  } catch (error) {
    res.status(500).json({ error: "Failed to create annotation" });
  }
});

router.get("/project/:projectId", async (req: AuthRequest, res) => {
  try {
    const annotations = await annotationRepository.find({
      where: { project: { id: req.params.projectId } },
      relations: ["labels"],
    });
    res.json(annotations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch annotations" });
  }
});

// Full hierarchy tree: tenant → project → task → job with annotation counts
router.get("/tree", async (req: AuthRequest, res) => {
  try {
    const isAdmin = req.user!.role === "admin" || req.user!.role === "manager";
    const userId = req.user!.id;

    const rows = await AppDataSource.query(`
      SELECT
        COALESCE(o.id::text, 'no-tenant')   AS "tenantId",
        COALESCE(o.name, 'No Tenant')        AS "tenantName",
        p.id                                  AS "projectId",
        p.name                                AS "projectName",
        p."dataType",
        t.id                                  AS "taskId",
        t.name                                AS "taskName",
        j.id                                  AS "jobId",
        j.stage,
        j.state,
        j."frameStart",
        j."frameEnd",
        (j."frameEnd" - j."frameStart" + 1)  AS "totalFrames",
        COUNT(DISTINCT a.id)                  AS "annotatedFrames",
        COALESCE(SUM(
          json_array_length(COALESCE(a.shapes, '[]'::json))
        ), 0)                                 AS "shapeCount",
        MAX(a."updatedAt")                    AS "lastAnnotatedAt",
        u.username                            AS "assignee",
        j."assigneeId"::text                  AS "assigneeId"
      FROM projects p
      LEFT JOIN organizations o ON o.id = p."organizationId"
      JOIN tasks t  ON t."projectId" = p.id
      JOIN jobs  j  ON j."taskId"   = t.id
      LEFT JOIN annotations a ON a."jobId" = j.id::text
      LEFT JOIN users u ON u.id = j."assigneeId"
      WHERE ($1 OR j."assigneeId" = $2::uuid OR p."createdById" = $2::uuid)
      GROUP BY o.id, o.name, p.id, p.name, p."dataType",
               t.id, t.name, j.id, j.stage, j.state,
               j."frameStart", j."frameEnd", u.username, j."assigneeId"
      ORDER BY o.name NULLS LAST, p.name, t.name, j."frameStart"
    `, [isAdmin, userId]);

    // Build tenant → project → task → job tree in JS
    const tenantMap = new Map<string, any>();

    for (const r of rows) {
      const annotatedFrames = parseInt(r.annotatedFrames, 10);
      const shapeCount      = parseInt(r.shapeCount, 10);
      const totalFrames     = parseInt(r.totalFrames, 10);

      if (!tenantMap.has(r.tenantId)) {
        tenantMap.set(r.tenantId, { id: r.tenantId, name: r.tenantName, projects: new Map() });
      }
      const tenant = tenantMap.get(r.tenantId);

      if (!tenant.projects.has(r.projectId)) {
        tenant.projects.set(r.projectId, { id: r.projectId, name: r.projectName, dataType: r.dataType, tasks: new Map() });
      }
      const project = tenant.projects.get(r.projectId);

      if (!project.tasks.has(r.taskId)) {
        project.tasks.set(r.taskId, { id: r.taskId, name: r.taskName, jobs: [] });
      }
      const task = project.tasks.get(r.taskId);

      task.jobs.push({
        id: r.jobId, stage: r.stage, state: r.state,
        frameStart: r.frameStart, frameEnd: r.frameEnd, totalFrames,
        annotatedFrames, shapeCount,
        lastAnnotatedAt: r.lastAnnotatedAt, assignee: r.assignee, assigneeId: r.assigneeId || null,
      });
    }

    const tree = Array.from(tenantMap.values()).map(t => ({
      ...t,
      projects: Array.from(t.projects.values()).map((p: any) => ({
        ...p,
        tasks: Array.from(p.tasks.values()),
      })),
    }));

    res.json(tree);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to build annotation tree" });
  }
});

// All annotation frames for a specific job, returned as a structured JSON document
router.get("/job/:jobId", async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;

    // Fetch job info and files separately to avoid complex parameterized subquery
    const [jobRows, annRows] = await Promise.all([
      AppDataSource.query(
        `SELECT j."taskId", t."projectId" FROM jobs j JOIN tasks t ON t.id = j."taskId" WHERE j.id = $1`,
        [jobId]
      ),
      AppDataSource.query(
        `SELECT id, "frameNumber", shapes, tags, tracks, notes, status, "updatedAt" FROM annotations WHERE "jobId" = $1 ORDER BY "frameNumber"`,
        [jobId]
      ),
    ]);

    if (!jobRows.length) return res.status(404).json({ error: "Job not found" });
    const { taskId } = jobRows[0];

    // Fetch file names for frames in this task
    const fileRows: any[] = await AppDataSource.query(
      `SELECT "frameNumber", "originalName", url FROM files WHERE "taskId" = $1 ORDER BY "frameNumber"`,
      [taskId]
    );
    const fileByFrame = new Map(fileRows.map((f: any) => [f.frameNumber, f]));

    const doc = {
      jobId,
      exportedAt: new Date().toISOString(),
      frameCount: annRows.length,
      frames: annRows.map((r: any) => {
        const file = fileByFrame.get(r.frameNumber);
        return {
          frameNumber: r.frameNumber,
          annotationId: r.id,
          fileName: file?.originalName || null,
          fileUrl: file?.url || null,
          status: r.status,
          updatedAt: r.updatedAt,
          shapes: r.shapes || [],
          tags: r.tags || [],
          tracks: r.tracks || [],
          notes: r.notes || null,
        };
      }),
    };

    res.json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch job annotations" });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const { data, notes, status, confidence } = req.body;
    const annotation = await annotationRepository.findOne({ where: { id: req.params.id } });

    if (!annotation) {
      return res.status(404).json({ error: "Annotation not found" });
    }

    if (data) annotation.data = data;
    if (notes) annotation.notes = notes;
    if (status) annotation.status = status;
    if (confidence) annotation.confidence = confidence;

    await annotationRepository.save(annotation);
    res.json(annotation);
  } catch (error) {
    res.status(500).json({ error: "Failed to update annotation" });
  }
});

export default router;
