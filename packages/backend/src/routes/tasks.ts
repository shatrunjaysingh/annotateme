import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Task } from "../entities/Task";
import { Job } from "../entities/Job";
import { authMiddleware, AuthRequest } from "../middlewares/auth";


const router = Router();
router.use(authMiddleware);

const taskRepo = AppDataSource.getRepository(Task);
const jobRepo = AppDataSource.getRepository(Job);

router.get("/", async (req: AuthRequest, res) => {
  try {
    const { projectId, tenantId } = req.query;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "manager";
    const userId = req.user!.id;

    if (tenantId && !projectId) {
      // Filter tasks by tenant via projects.organizationId
      const rows = await AppDataSource.query(`
        SELECT t.id FROM tasks t
        JOIN projects p ON p.id = t."projectId"
        WHERE p."organizationId" = $1
      `, [tenantId as string]);

      const taskIds = rows.map((r: any) => r.id);
      if (taskIds.length === 0) {
        return res.json([]);
      }

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

    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (!isAdmin && !projectId) where.assigneeId = userId;

    const tasks = await taskRepo.find({
      where,
      relations: ["assignee", "jobs", "project"],
      order: { createdAt: "DESC" },
    });
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
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const task = await taskRepo.findOne({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const { name, status, assigneeId, subset, thumbnailUrl, frameCount } = req.body;
    if (name !== undefined) task.name = name;
    if (status !== undefined) task.status = status;
    if (assigneeId !== undefined) task.assigneeId = assigneeId;
    if (subset !== undefined) task.subset = subset;
    if (thumbnailUrl !== undefined) task.thumbnailUrl = thumbnailUrl;
    if (frameCount !== undefined) task.frameCount = frameCount;

    await taskRepo.save(task);
    const updated = await taskRepo.findOne({ where: { id: task.id }, relations: ["assignee", "jobs"] });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const task = await taskRepo.findOne({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });
    await taskRepo.remove(task);
    res.status(204).send();
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ error: "Failed to create job" });
  }
});

export default router;
