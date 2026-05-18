import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { ShapeIssue } from "../entities/ShapeIssue";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const issueRepo = AppDataSource.getRepository(ShapeIssue);

// GET /api/shape-issues — query params: jobId (required), frameNumber (optional), status (optional)
router.get("/", async (req: AuthRequest, res) => {
  const { jobId, frameNumber, status } = req.query;

  if (!jobId) {
    return res.status(400).json({ error: "jobId is required" });
  }

  try {
    const qb = issueRepo.createQueryBuilder("issue")
      .leftJoinAndSelect("issue.author", "author")
      .where("issue.jobId = :jobId", { jobId })
      .orderBy("issue.createdAt", "DESC");

    if (frameNumber !== undefined) {
      qb.andWhere("issue.frameNumber = :frameNumber", { frameNumber: Number(frameNumber) });
    }

    if (status !== undefined) {
      qb.andWhere("issue.status = :status", { status });
    }

    const issues = await qb.getMany();
    res.json(issues);
  } catch {
    res.status(500).json({ error: "Failed to fetch shape issues" });
  }
});

// POST /api/shape-issues — body: { jobId, frameNumber, shapeId?, comment }
router.post("/", async (req: AuthRequest, res) => {
  const { jobId, frameNumber, shapeId, comment } = req.body;

  if (!jobId || frameNumber === undefined || !comment) {
    return res.status(400).json({ error: "jobId, frameNumber, and comment are required" });
  }

  try {
    const issue = issueRepo.create({
      jobId,
      frameNumber: Number(frameNumber),
      shapeId: shapeId ?? null,
      comment,
      status: "open",
      authorId: req.user!.id,
      resolvedBy: null,
      resolvedAt: null,
    });

    const saved = await issueRepo.save(issue);
    // Reload with author relation
    const full = await issueRepo.findOne({ where: { id: saved.id }, relations: ["author"] });
    res.status(201).json(full);
  } catch {
    res.status(500).json({ error: "Failed to create shape issue" });
  }
});

// PATCH /api/shape-issues/:id/resolve — mark as resolved
router.patch("/:id/resolve", async (req: AuthRequest, res) => {
  try {
    const issue = await issueRepo.findOne({ where: { id: req.params.id }, relations: ["author"] });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    issue.status = "resolved";
    issue.resolvedBy = req.user!.id;
    issue.resolvedAt = new Date();

    await issueRepo.save(issue);
    res.json(issue);
  } catch {
    res.status(500).json({ error: "Failed to resolve issue" });
  }
});

// DELETE /api/shape-issues/:id — only author or admin can delete
router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const issue = await issueRepo.findOne({ where: { id: req.params.id } });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const isAuthor = issue.authorId === req.user!.id;
    const isAdmin = req.user!.role === "admin";

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: "Forbidden: only author or admin can delete this issue" });
    }

    await issueRepo.remove(issue);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete issue" });
  }
});

export default router;
