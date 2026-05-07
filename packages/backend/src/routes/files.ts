import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { AppDataSource } from "../database/data-source";
import { File as FileEntity } from "../entities/File";
import { Task } from "../entities/Task";
import { Job } from "../entities/Job";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const fileRepo = AppDataSource.getRepository(FileEntity);
const taskRepo = AppDataSource.getRepository(Task);
const jobRepo = AppDataSource.getRepository(Job);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|bmp|webp|mp4|avi|mov|mkv|webm/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) cb(null, true);
    else cb(new Error("Only image and video files are allowed"));
  },
});

router.post("/upload", upload.array("files", 500), async (req: AuthRequest, res) => {
  try {
    const { taskId, projectId } = req.body;
    const uploadedFiles = req.files as Express.Multer.File[];
    if (!uploadedFiles || uploadedFiles.length === 0) return res.status(400).json({ error: "No files uploaded" });

    const saved: FileEntity[] = [];
    for (let i = 0; i < uploadedFiles.length; i++) {
      const f = uploadedFiles[i];
      const record = fileRepo.create({
        originalName: f.originalname,
        fileName: f.filename,
        mimeType: f.mimetype,
        size: f.size,
        path: f.path,
        url: `/uploads/${f.filename}`,
        frameNumber: i,
        status: "completed",
        taskId: taskId || null,
        projectId: projectId || null,
      });
      saved.push(await fileRepo.save(record));
    }

    if (taskId) {
      const task = await taskRepo.findOne({ where: { id: taskId } });
      if (task) {
        task.frameCount = task.frameCount + uploadedFiles.length;
        if (!task.thumbnailUrl && saved[0]?.url) task.thumbnailUrl = saved[0].url;
        await taskRepo.save(task);

        // Create job spanning all frames if none exist
        const existingJobs = await jobRepo.find({ where: { taskId } });
        if (existingJobs.length === 0) {
          const job = jobRepo.create({ taskId, stage: "annotation", state: "new", type: "annotation", frameStart: 0, frameEnd: task.frameCount - 1 });
          await jobRepo.save(job);
        } else {
          const job = existingJobs[0];
          job.frameEnd = task.frameCount - 1;
          await jobRepo.save(job);
        }
      }
    }

    res.status(201).json(saved);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Upload failed" });
  }
});

router.get("/task/:taskId", async (req: AuthRequest, res) => {
  try {
    const files = await fileRepo.find({ where: { taskId: req.params.taskId }, order: { frameNumber: "ASC" } });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const file = await fileRepo.findOne({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ error: "File not found" });
    res.json(file);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch file" });
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const file = await fileRepo.findOne({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ error: "File not found" });
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    await fileRepo.remove(file);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

export default router;
