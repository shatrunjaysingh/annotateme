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

// Summary of all annotated jobs with project/task context
router.get("/summary", async (req: AuthRequest, res) => {
  try {
    const isAdmin = req.user!.role === "admin" || req.user!.role === "manager";
    const userId = req.user!.id;

    const rows = await AppDataSource.query(`
      SELECT
        j.id                              AS "jobId",
        j.stage,
        j.state,
        j."frameStart",
        j."frameEnd",
        (j."frameEnd" - j."frameStart" + 1) AS "totalFrames",
        COUNT(DISTINCT a.id)              AS "annotatedFrames",
        COALESCE(SUM(jsonb_array_length(COALESCE(a.shapes,'[]'::jsonb))), 0) AS "shapeCount",
        MAX(a."updatedAt")                AS "lastAnnotatedAt",
        t.id                              AS "taskId",
        t.name                            AS "taskName",
        p.id                              AS "projectId",
        p.name                            AS "projectName",
        p."dataType",
        u.username                        AS "assignee"
      FROM jobs j
      JOIN tasks t  ON t.id  = j."taskId"
      JOIN projects p ON p.id = t."projectId"
      LEFT JOIN annotations a ON a."jobId" = j.id
      LEFT JOIN users u ON u.id = j."assigneeId"
      WHERE
        ${isAdmin ? 'TRUE' : `(j."assigneeId" = '${userId}' OR p."createdById" = '${userId}')`}
      GROUP BY j.id, t.id, t.name, p.id, p.name, p."dataType", u.username
      HAVING COUNT(DISTINCT a.id) > 0
      ORDER BY MAX(a."updatedAt") DESC NULLS LAST
    `);

    res.json(rows.map((r: any) => ({
      ...r,
      annotatedFrames: parseInt(r.annotatedFrames, 10),
      shapeCount: parseInt(r.shapeCount, 10),
      totalFrames: parseInt(r.totalFrames, 10),
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch annotation summary" });
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
