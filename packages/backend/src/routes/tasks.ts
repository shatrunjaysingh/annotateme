import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Task } from "../entities/Task";
import { Job } from "../entities/Job";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { logTaskAudit, logJobAudit, diffFields } from "../services/audit.service";

const router = Router();
router.use(authMiddleware);

const taskRepo = AppDataSource.getRepository(Task);
const jobRepo  = AppDataSource.getRepository(Job);

router.get("/", async (req: AuthRequest, res) => {
  try {
    const { projectId, tenantId } = req.query;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "manager";
    const userId = req.user!.id;

    if (tenantId && !projectId) {
      const rows = await AppDataSource.query(`
        SELECT t.id FROM tasks t
        JOIN projects p ON p.id = t."projectId"
        WHERE p."organizationId" = $1
      `, [tenantId as string]);

      const taskIds = rows.map((r: any) => r.id);
      if (taskIds.length === 0) return res.json([]);

      const tasks = await taskRepo
        .createQueryBuilder("t")
        .leftJoinAndSelect("t.assignee", "assignee")
        .leftJoinAndSelect("t.jobs", "jobs")
        .leftJoinAndSelect("t.project", "project")
        .where("t.id IN (:...taskIds)", { taskIds })
        .orderBy("t.createdAt", "DESC")
        .getMany();

      return res.json(tasks);
    }

    if (projectId) {
      const tasks = await taskRepo.find({
        where: { projectId: projectId as string },
        relations: ["assignee", "jobs", "jobs.assignee", "project"],
        order: { createdAt: "DESC" },
      });
      return res.json(tasks);
    }

    if (isAdmin) {
      const tasks = await taskRepo.find({
        relations: ["assignee", "jobs", "jobs.assignee", "project"],
        order: { createdAt: "DESC" },
      });
      return res.json(tasks);
    }

    const rows = await AppDataSource.query(
      `SELECT DISTINCT t.id FROM tasks t
       LEFT JOIN jobs j ON j."taskId" = t.id
       WHERE t."assigneeId" = $1
          OR j."assigneeId" = $1`,
      [userId]
    );

    if (rows.length === 0) return res.json([]);

    const taskIds = rows.map((r: any) => r.id);
    const tasks = await taskRepo
      .createQueryBuilder("t")
      .leftJoinAndSelect("t.assignee", "assignee")
      .leftJoinAndSelect("t.jobs", "jobs")
      .leftJoinAndSelect("jobs.assignee", "jobAssignee")
      .leftJoinAndSelect("t.project", "project")
      .where("t.id IN (:...taskIds)", { taskIds })
      .orderBy("t.createdAt", "DESC")
      .getMany();

    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { projectId, name, subset, assigneeId } = req.body;
    if (!projectId || !name) return res.status(400).json({ error: "projectId and name are required" });

    const task = taskRepo.create({ projectId, name, subset: subset || "Train", assigneeId: assigneeId || null });
    await taskRepo.save(task);

    const job = jobRepo.create({ taskId: task.id, stage: "annotation", state: "new", type: "annotation", frameStart: 0, frameEnd: 0 });
    await jobRepo.save(job);

    const saved = await taskRepo.findOne({ where: { id: task.id }, relations: ["assignee", "jobs"] });
    res.status(201).json(saved);

    // Fire-and-forget audit entries (do not await to keep response fast)
    logTaskAudit({ taskId: task.id, userId: req.user!.id, action: "created", note: `Task "${name}" created` });
    logJobAudit({ jobId: job.id, taskId: task.id, userId: req.user!.id, action: "created", note: "Default annotation job created with task" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const task = await taskRepo.findOne({
      where: { id: req.params.id },
      relations: ["assignee", "jobs", "jobs.assignee", "files", "project"],
    });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch {
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const task = await taskRepo.findOne({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const { name, status, assigneeId, subset, thumbnailUrl, frameCount } = req.body;

    const changes = diffFields(
      task as unknown as Record<string, unknown>,
      { name, status, assigneeId, subset, frameCount } as Record<string, unknown>,
      ["name", "status", "assigneeId", "subset", "frameCount"]
    );

    if (name        !== undefined) task.name        = name;
    if (status      !== undefined) task.status      = status;
    if (assigneeId  !== undefined) task.assigneeId  = assigneeId;
    if (subset      !== undefined) task.subset      = subset;
    if (thumbnailUrl !== undefined) task.thumbnailUrl = thumbnailUrl;
    if (frameCount  !== undefined) task.frameCount  = frameCount;

    await taskRepo.save(task);
    const updated = await taskRepo.findOne({ where: { id: task.id }, relations: ["assignee", "jobs"] });
    res.json(updated);

    if (Object.keys(changes).length > 0) {
      logTaskAudit({ taskId: task.id, userId: req.user!.id, action: "updated", changes });
    }
  } catch {
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const task = await taskRepo.findOne({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    // Log before delete so the taskId still resolves
    await logTaskAudit({ taskId: task.id, userId: req.user!.id, action: "deleted", note: `Task "${task.name}" deleted` });

    await taskRepo.remove(task);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete task" });
  }
});

router.get("/:id/jobs", async (req: AuthRequest, res) => {
  try {
    const jobs = await jobRepo.find({
      where: { taskId: req.params.id },
      relations: ["assignee"],
      order: { createdAt: "ASC" },
    });
    res.json(jobs);
  } catch {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

router.post("/:id/jobs", async (req: AuthRequest, res) => {
  try {
    const { assigneeId, stage, frameStart, frameEnd, type } = req.body;
    const task = await taskRepo.findOne({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const job = jobRepo.create({
      taskId: req.params.id,
      assigneeId: assigneeId || null,
      stage: stage || "annotation",
      state: "new",
      type: type || "annotation",
      frameStart: frameStart ?? 0,
      frameEnd: frameEnd ?? task.frameCount,
    });
    await jobRepo.save(job);
    const saved = await jobRepo.findOne({ where: { id: job.id }, relations: ["assignee"] });
    res.status(201).json(saved);

    logTaskAudit({ taskId: task.id, userId: req.user!.id, action: "job_added", note: `Job ${job.id} (${job.stage}) added` });
    logJobAudit({ jobId: job.id, taskId: task.id, userId: req.user!.id, action: "created", note: `Job created (stage: ${job.stage})` });
  } catch {
    res.status(500).json({ error: "Failed to create job" });
  }
});

export default router;
