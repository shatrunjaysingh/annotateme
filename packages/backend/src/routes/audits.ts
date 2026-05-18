import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { TaskAudit } from "../entities/TaskAudit";
import { JobAudit } from "../entities/JobAudit";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const taskAuditRepo = AppDataSource.getRepository(TaskAudit);
const jobAuditRepo  = AppDataSource.getRepository(JobAudit);

// GET /api/audits/tasks/:taskId
// Returns the audit log for a task, newest first.
// Optionally includes child job audit entries via ?includeJobs=true.
router.get("/tasks/:taskId", async (req: AuthRequest, res) => {
  try {
    const { taskId } = req.params;
    const limit  = Math.min(parseInt(req.query.limit  as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const [entries, total] = await taskAuditRepo.findAndCount({
      where: { taskId },
      relations: ["user"],
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    let jobEntries: JobAudit[] = [];
    if (req.query.includeJobs === "true") {
      jobEntries = await jobAuditRepo.find({
        where: { taskId },
        relations: ["user"],
        order: { createdAt: "DESC" },
        take: limit,
        skip: offset,
      });
    }

    res.json({ total, limit, offset, entries, jobEntries });
  } catch {
    res.status(500).json({ error: "Failed to fetch task audit log" });
  }
});

// GET /api/audits/jobs/:jobId
// Returns the audit log for a single job, newest first.
router.get("/jobs/:jobId", async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;
    const limit  = Math.min(parseInt(req.query.limit  as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const [entries, total] = await jobAuditRepo.findAndCount({
      where: { jobId },
      relations: ["user"],
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    res.json({ total, limit, offset, entries });
  } catch {
    res.status(500).json({ error: "Failed to fetch job audit log" });
  }
});

export default router;
