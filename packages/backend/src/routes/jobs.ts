import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Job } from "../entities/Job";
import { Annotation } from "../entities/Annotation";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { logJobAudit, diffFields } from "../services/audit.service";

const router = Router();
router.use(authMiddleware);

const jobRepo        = AppDataSource.getRepository(Job);
const annotationRepo = AppDataSource.getRepository(Annotation);

// Recomputes task.annotatedFrames and project progress after any annotation change.
async function refreshProgress(jobId: string): Promise<void> {
  const rows = await AppDataSource.query(
    `SELECT j."taskId", t."projectId"
     FROM jobs j
     JOIN tasks t ON t.id = j."taskId"
     WHERE j.id = $1`,
    [jobId]
  );
  if (!rows.length) return;
  const { taskId, projectId } = rows[0];

  const [{ annotated }] = await AppDataSource.query(
    `SELECT COUNT(DISTINCT a."frameNumber") AS annotated
     FROM annotations a
     JOIN jobs j ON j.id = a."jobId"
     WHERE j."taskId" = $1`,
    [taskId]
  );
  await AppDataSource.query(
    `UPDATE tasks SET "annotatedFrames" = $1 WHERE id = $2`,
    [parseInt(annotated) || 0, taskId]
  );

  const [proj] = await AppDataSource.query(
    `SELECT COALESCE(SUM("frameCount"), 0)      AS total,
            COALESCE(SUM("annotatedFrames"), 0) AS annotated
     FROM tasks WHERE "projectId" = $1`,
    [projectId]
  );
  const total = parseInt(proj.total) || 0;
  const ann   = parseInt(proj.annotated) || 0;
  const pct   = total > 0 ? Math.round((ann / total) * 100) : 0;
  await AppDataSource.query(
    `UPDATE projects SET "totalItems" = $1, "annotatedItems" = $2, progress = $3 WHERE id = $4`,
    [total, ann, pct, projectId]
  );
}

router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const job = await jobRepo.findOne({
      where: { id: req.params.id },
      relations: ["assignee", "validatedBy", "acceptedBy", "task", "task.project"],
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch {
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const job = await jobRepo.findOne({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found" });

    const { assigneeId, stage, state, reviewNote, validatedById, acceptedById } = req.body;

    // Build diff before applying changes
    const changes = diffFields(
      job as unknown as Record<string, unknown>,
      { assigneeId, stage, state, reviewNote, validatedById, acceptedById } as Record<string, unknown>,
      ["assigneeId", "stage", "state", "reviewNote", "validatedById", "acceptedById"]
    );

    if (assigneeId   !== undefined) job.assigneeId   = assigneeId;
    if (stage        !== undefined) job.stage        = stage;
    if (state        !== undefined) job.state        = state;
    if (reviewNote   !== undefined) job.reviewNote   = reviewNote;
    if (validatedById !== undefined) job.validatedById = validatedById;
    if (acceptedById !== undefined) job.acceptedById = acceptedById;

    await jobRepo.save(job);
    const updated = await jobRepo.findOne({
      where: { id: job.id },
      relations: ["assignee", "validatedBy", "acceptedBy"],
    });
    res.json(updated);

    // Fire-and-forget audit entries — pick the most specific action type
    if (Object.keys(changes).length > 0) {
      const action = changes.stage
        ? "stage_changed"
        : changes.state
        ? "state_changed"
        : changes.assigneeId
        ? "assigned"
        : "updated";

      let note: string | undefined;
      if (changes.stage) note = `Stage: ${changes.stage.from} → ${changes.stage.to}`;
      else if (changes.state) note = `State: ${changes.state.from} → ${changes.state.to}`;

      logJobAudit({ jobId: job.id, taskId: job.taskId, userId: req.user!.id, action, changes, note });
    }
  } catch {
    res.status(500).json({ error: "Failed to update job" });
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const job = await jobRepo.findOne({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Log before delete so FK still resolves
    await logJobAudit({ jobId: job.id, taskId: job.taskId, userId: req.user!.id, action: "deleted", note: `Job deleted (stage: ${job.stage}, state: ${job.state})` });

    await jobRepo.remove(job);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete job" });
  }
});

router.get("/:id/frame/:frameNum", async (req: AuthRequest, res) => {
  try {
    const { id, frameNum } = req.params;
    const annotation = await annotationRepo.findOne({
      where: { jobId: id, frameNumber: parseInt(frameNum) },
    });
    if (!annotation) return res.json({ shapes: [], tags: [], tracks: [] });
    res.json({ shapes: annotation.shapes || [], tags: annotation.tags || [], tracks: annotation.tracks || [] });
  } catch {
    res.status(500).json({ error: "Failed to fetch frame annotations" });
  }
});

router.post("/:id/frame/:frameNum", async (req: AuthRequest, res) => {
  try {
    const { id, frameNum } = req.params;
    const { shapes, tags, tracks } = req.body;
    const frameNumber = parseInt(frameNum);

    const job = await jobRepo.findOne({ where: { id } });
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.stage !== "annotation") {
      return res.status(403).json({ error: "Job is in review. An admin must reset it to annotation stage before it can be edited." });
    }

    let annotation = await annotationRepo.findOne({ where: { jobId: id, frameNumber } });
    if (!annotation) {
      annotation = annotationRepo.create({ jobId: id, frameNumber, status: "in_progress" });
    }
    annotation.shapes = shapes || [];
    annotation.tags   = tags   || [];
    annotation.tracks = tracks || [];

    await annotationRepo.save(annotation);

    // Auto-reopen: new or completed annotation jobs become in_progress on first edit
    const prevState = job.state;
    const wasNew = job.state === "new" || job.state === "completed";
    if (wasNew) {
      job.state = "in_progress";
      await jobRepo.save(job);
    }

    refreshProgress(id).catch(() => {});

    res.json(annotation);

    // Audit (fire-and-forget)
    const shapeCount = (shapes || []).length;
    logJobAudit({
      jobId: id,
      taskId: job.taskId,
      userId: req.user!.id,
      action: "annotation_saved",
      note: `Frame ${frameNumber}: ${shapeCount} shape${shapeCount !== 1 ? "s" : ""} saved`,
    });
    if (wasNew) {
      logJobAudit({ jobId: id, taskId: job.taskId, userId: req.user!.id, action: "state_changed", changes: { state: { from: prevState, to: "in_progress" } } });
    }
  } catch {
    res.status(500).json({ error: "Failed to save annotations" });
  }
});

// GET /:id/export — download all frame annotations as JSON
router.get("/:id/export", async (req: AuthRequest, res) => {
  const id = req.params.id;
  const job = await jobRepo.findOne({ where: { id }, relations: ["task", "task.project"] });
  if (!job) return res.status(404).json({ error: "Job not found" });
  const annotations = await annotationRepo.find({ where: { jobId: id }, order: { frameNumber: "ASC" } });
  const exportData = {
    version: "1.0",
    job: { id, stage: job.stage, state: job.state },
    task: { name: job.task?.name },
    project: { name: (job.task as any)?.project?.name, labelSet: (job.task as any)?.project?.labelSet || [] },
    frames: annotations.map(a => ({ frameNumber: a.frameNumber, shapes: a.shapes || [], tags: a.tags || [], tracks: a.tracks || [] })),
  };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="job-${id}-annotations.json"`);
  res.json(exportData);
});

// DELETE /:id/annotations — remove all annotations for a job
router.delete("/:id/annotations", async (req: AuthRequest, res) => {
  const job = await jobRepo.findOne({ where: { id: req.params.id } });
  await annotationRepo.delete({ jobId: req.params.id });
  refreshProgress(req.params.id).catch(() => {});
  res.json({ message: "All annotations removed" });

  if (job) {
    logJobAudit({ jobId: req.params.id, taskId: job.taskId, userId: req.user!.id, action: "annotations_cleared", note: "All frame annotations deleted" });
  }
});

export default router;
