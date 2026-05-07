import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Job } from "../entities/Job";
import { Annotation } from "../entities/Annotation";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const jobRepo = AppDataSource.getRepository(Job);
const annotationRepo = AppDataSource.getRepository(Annotation);

router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const job = await jobRepo.findOne({
      where: { id: req.params.id },
      relations: ["assignee", "task", "task.project"],
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const job = await jobRepo.findOne({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found" });

    const { assigneeId, stage, state } = req.body;
    if (assigneeId !== undefined) job.assigneeId = assigneeId;
    if (stage !== undefined) job.stage = stage;
    if (state !== undefined) job.state = state;

    await jobRepo.save(job);
    const updated = await jobRepo.findOne({ where: { id: job.id }, relations: ["assignee"] });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update job" });
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const job = await jobRepo.findOne({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found" });
    await jobRepo.remove(job);
    res.status(204).send();
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch frame annotations" });
  }
});

router.post("/:id/frame/:frameNum", async (req: AuthRequest, res) => {
  try {
    const { id, frameNum } = req.params;
    const { shapes, tags, tracks } = req.body;
    const frameNumber = parseInt(frameNum);

    let annotation = await annotationRepo.findOne({ where: { jobId: id, frameNumber } });
    if (!annotation) {
      annotation = annotationRepo.create({ jobId: id, frameNumber, status: "in_progress" });
    }
    annotation.shapes = shapes || [];
    annotation.tags = tags || [];
    annotation.tracks = tracks || [];

    await annotationRepo.save(annotation);

    // Update job state to in_progress if it was new
    const job = await jobRepo.findOne({ where: { id } });
    if (job && job.state === "new") {
      job.state = "in_progress";
      await jobRepo.save(job);
    }

    res.json(annotation);
  } catch (error) {
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
    frames: annotations.map(a => ({ frameNumber: a.frameNumber, shapes: a.shapes || [], tags: a.tags || [], tracks: a.tracks || [] }))
  };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="job-${id}-annotations.json"`);
  res.json(exportData);
});

// DELETE /:id/annotations — remove all annotations for a job
router.delete("/:id/annotations", async (req: AuthRequest, res) => {
  await annotationRepo.delete({ jobId: req.params.id });
  res.json({ message: "All annotations removed" });
});

export default router;
