import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as csv from "csv-parse/sync";
import { AppDataSource } from "../database/data-source";
import { Project } from "../entities/Project";
import { File as FileEntity } from "../entities/File";
import { Annotation } from "../entities/Annotation";
import { Task } from "../entities/Task";
import { Job } from "../entities/Job";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { FormatConverter } from "../services/format-converter";
import * as StorageService from "../services/storage.service";

const router = Router();
router.use(authMiddleware);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const projectRepo = AppDataSource.getRepository(Project);
const fileRepo = AppDataSource.getRepository(FileEntity);
const annotationRepo = AppDataSource.getRepository(Annotation);
const taskRepo = AppDataSource.getRepository(Task);
const jobRepo  = AppDataSource.getRepository(Job);

// ── Storage mode info ────────────────────────────────────────────────────────
router.get("/storage-mode", (_req, res) => {
  res.json({ mode: StorageService.storageMode() });
});

// ── Serve locally-stored export files ───────────────────────────────────────
router.get("/local-download", async (req: AuthRequest, res) => {
  const fileKey = req.query.file as string;
  if (!fileKey) return res.status(400).json({ error: "file parameter required" });

  const abs = path.join(process.cwd(), fileKey);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: "File not found" });

  res.download(abs);
});

// ── Upload files (images / video) for a project/task ────────────────────────
router.post("/:projectId/upload", upload.array("files", 500), async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const { taskId } = req.body;

    const project = await projectRepo.findOne({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const uploaded: FileEntity[] = [];

    for (const file of req.files as Express.Multer.File[]) {
      const result = await StorageService.uploadFile(
        file.buffer,
        file.originalname,
        `projects/${projectId}`,
        file.mimetype
      );

      const record = fileRepo.create({
        originalName: file.originalname,
        fileName: path.basename(result.key),
        mimeType: file.mimetype,
        size: file.size,
        path: result.key,
        url: result.url,
        status: "completed",
        projectId,
        taskId: taskId || null,
        frameNumber: uploaded.length,
      });

      uploaded.push(await fileRepo.save(record));
    }

    project.totalItems += uploaded.length;
    await projectRepo.save(project);

    // Update task frame count if taskId provided
    if (taskId) {
      const task = await taskRepo.findOne({ where: { id: taskId } });
      if (task) {
        task.frameCount += uploaded.length;
        if (!task.thumbnailUrl && uploaded[0]?.url) task.thumbnailUrl = uploaded[0].url;
        await taskRepo.save(task);
      }
    }

    res.status(201).json({ message: "Files uploaded successfully", files: uploaded, count: uploaded.length, storageMode: StorageService.storageMode() });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "File upload failed" });
  }
});

// ── Import annotations from file ─────────────────────────────────────────────
router.post("/:projectId/import", upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const { format } = req.query;

    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const project = await projectRepo.findOne({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const fileContent = req.file.buffer.toString("utf-8");
    const detectedFormat = (format as string) || FormatConverter.detectFormat(fileContent);

    if (!detectedFormat) return res.status(400).json({ error: "Could not detect file format" });

    let unifiedAnnotations: any[] = [];

    try {
      if (detectedFormat === "coco") {
        const cocoData = JSON.parse(fileContent);
        const cocoValidation = FormatConverter.validateCOCO(cocoData);
        if (!cocoValidation.valid) return res.status(400).json({ error: "Invalid COCO format", details: cocoValidation.errors });
        unifiedAnnotations = FormatConverter.cocoToUnified(cocoData);
      } else if (detectedFormat === "pascal_voc") {
        const vocData = JSON.parse(fileContent);
        const vocValidation = FormatConverter.validatePascalVOC(vocData);
        if (!vocValidation.valid) return res.status(400).json({ error: "Invalid Pascal VOC format", details: vocValidation.errors });
        unifiedAnnotations = FormatConverter.pascalVocToUnified(vocData);
      } else if (detectedFormat === "yolo") {
        const yoloData = JSON.parse(fileContent);
        const yoloValidation = FormatConverter.validateYOLO(yoloData);
        if (!yoloValidation.valid) return res.status(400).json({ error: "Invalid YOLO format", details: yoloValidation.errors });
        const classNames = req.body.classNames || yoloData.classNames || [];
        unifiedAnnotations = FormatConverter.yoloToUnified(yoloData, classNames);
      } else if (detectedFormat === "csv") {
        const csvData = csv.parse(fileContent, { columns: true }) as any[];
        const labelField = req.body.labelField || "label";
        unifiedAnnotations = FormatConverter.csvToUnified(csvData, labelField);
      } else {
        const jsonData = JSON.parse(fileContent);
        if (Array.isArray(jsonData)) {
          unifiedAnnotations = jsonData.map((item, idx) => ({
            id: `json-${idx}`,
            fileId: item.file_name || item.filename || item.image || `file-${idx}`,
            format: "json",
            data: item,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
        }
      }
    } catch {
      return res.status(400).json({ error: "Failed to parse file" });
    }

    const saved = [];
    for (const unified of unifiedAnnotations) {
      const ann = annotationRepo.create({ fileId: unified.fileId, data: unified.data, project: { id: projectId } as any });
      saved.push(await annotationRepo.save(ann));
    }

    project.annotatedItems += unifiedAnnotations.length;
    project.progress = project.totalItems > 0 ? Math.round((project.annotatedItems / project.totalItems) * 100) : 0;
    await projectRepo.save(project);

    res.json({ message: "Annotations imported successfully", format: detectedFormat, count: unifiedAnnotations.length });
  } catch (error: any) {
    console.error("Import error:", error);
    res.status(500).json({ error: "Import failed" });
  }
});

// ── Export annotations in specified format ────────────────────────────────────
router.get("/:projectId/export", async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const format = (req.query.format as string) || "coco";
    const taskId = req.query.taskId as string | undefined;

    const project = await projectRepo.findOne({ where: { id: projectId }, relations: ["organization"] });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const tenantId: string | undefined = (project as any).organization?.id;

    const whereClause: any = { project: { id: projectId } };
    if (taskId) whereClause.jobId = undefined; // extend as needed

    const annotations = await annotationRepo.find({ where: whereClause });

    const unified = annotations.map((ann) => ({
      id: ann.id,
      fileId: ann.fileId,
      format: "json",
      data: ann.data || { shapes: ann.shapes, tags: ann.tags, tracks: ann.tracks },
      createdAt: ann.createdAt,
      updatedAt: ann.updatedAt,
    }));

    let exportData: any;
    let filename: string;

    switch (format) {
      case "coco":
        exportData = FormatConverter.unifiedToCOCO(unified as any, project.name);
        filename = `${project.name}-coco.json`;
        break;
      case "pascal_voc":
        exportData = FormatConverter.unifiedToPascalVOC(unified as any);
        filename = `${project.name}-pascal-voc.json`;
        break;
      case "yolo": {
        const yolo = FormatConverter.unifiedToYOLO(unified as any);
        exportData = { annotations: yolo.annotations, classNames: yolo.classNames };
        filename = `${project.name}-yolo.json`;
        break;
      }
      case "csv":
        exportData = unified.map((a) => ({ fileId: a.fileId, data: JSON.stringify(a.data), createdAt: a.createdAt }));
        filename = `${project.name}-annotations.csv`;
        break;
      default:
        exportData = unified;
        filename = `${project.name}-annotations.json`;
    }

    // Direct download — stream the file without needing S3
    if (req.query.download === "true") {
      const content = format === "csv" ? JSON.stringify(exportData) : JSON.stringify(exportData, null, 2);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", format === "csv" ? "text/csv" : "application/json");
      return res.send(content);
    }

    const buffer = Buffer.from(format === "csv" ? JSON.stringify(exportData) : JSON.stringify(exportData, null, 2));
    const result = await StorageService.saveExport(buffer, filename, projectId, format, tenantId);

    res.json({
      message: "Annotations exported successfully",
      format,
      filename,
      downloadUrl: result.downloadUrl,
      storageMode: StorageService.storageMode(),
      count: unified.length,
    });
  } catch (error: any) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

// ── File download URL ─────────────────────────────────────────────────────────
router.get("/file/:fileId/download", async (req: AuthRequest, res) => {
  try {
    const file = await fileRepo.findOne({ where: { id: req.params.fileId } });
    if (!file) return res.status(404).json({ error: "File not found" });

    const isLocal = !file.path.startsWith("projects/") || StorageService.storageMode() === "local";
    const downloadUrl = await StorageService.getDownloadUrl(file.path, isLocal);

    res.json({ filename: file.originalName, downloadUrl, size: file.size });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

// ── List project files ────────────────────────────────────────────────────────
router.get("/:projectId/files", async (req: AuthRequest, res) => {
  try {
    const files = await fileRepo.find({ where: { projectId: req.params.projectId }, order: { uploadedAt: "DESC" } });
    res.json({ count: files.length, files });
  } catch (error) {
    res.status(500).json({ error: "Failed to list files" });
  }
});

// ── Export all annotation work for a project ─────────────────────────────────
// Walks project → tasks → jobs → annotations using three repo queries so there
// are no raw SQL column-quoting issues.
router.get("/:projectId/annotations/export", async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;

    const project = await projectRepo.findOne({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // 1. All tasks for this project
    const tasks = await taskRepo.find({
      where: { projectId },
      order: { name: "ASC" },
    });

    if (tasks.length === 0) {
      const empty = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        project: { id: project.id, name: project.name, dataType: project.dataType, labelSet: project.labelSet || [] },
        tasks: [],
        totalFrames: 0,
      };
      const fname = `${project.name.replace(/[^a-z0-9]/gi, "_")}-annotations.json`;
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
      res.setHeader("Content-Type", "application/json");
      return res.send(JSON.stringify(empty, null, 2));
    }

    const taskIds = tasks.map(t => t.id);

    // 2. All jobs for those tasks
    const jobs = await jobRepo
      .createQueryBuilder("j")
      .where("j.taskId IN (:...taskIds)", { taskIds })
      .orderBy("j.taskId")
      .addOrderBy("j.id")
      .getMany();

    const jobIds = jobs.map(j => j.id);

    // 3. All annotations for those jobs
    let annotations: Annotation[] = [];
    if (jobIds.length > 0) {
      annotations = await annotationRepo
        .createQueryBuilder("a")
        .where("a.jobId IN (:...jobIds)", { jobIds })
        .orderBy("a.jobId")
        .addOrderBy("a.frameNumber")
        .getMany();
    }

    // Group annotations by jobId
    const annByJob = new Map<string, Annotation[]>();
    for (const a of annotations) {
      if (!annByJob.has(a.jobId)) annByJob.set(a.jobId, []);
      annByJob.get(a.jobId)!.push(a);
    }

    // Group jobs by taskId
    const jobsByTask = new Map<string, typeof jobs>();
    for (const j of jobs) {
      if (!jobsByTask.has(j.taskId)) jobsByTask.set(j.taskId, []);
      jobsByTask.get(j.taskId)!.push(j);
    }

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        dataType: project.dataType,
        labelSet: project.labelSet || [],
      },
      tasks: tasks.map(t => ({
        id: t.id,
        name: t.name,
        subset: t.subset,
        frameCount: t.frameCount,
        jobs: (jobsByTask.get(t.id) || []).map(j => ({
          id: j.id,
          stage: j.stage,
          state: j.state,
          frameStart: j.frameStart,
          frameEnd: j.frameEnd,
          frames: (annByJob.get(j.id) || []).map(a => ({
            frameNumber: a.frameNumber,
            shapes: a.shapes || [],
            tags: a.tags || [],
            tracks: a.tracks || [],
            updatedAt: a.updatedAt,
          })),
        })),
      })),
      totalFrames: annotations.length,
    };

    const filename = `${project.name.replace(/[^a-z0-9]/gi, "_")}-annotations.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error: any) {
    console.error("Annotations export error:", error);
    res.status(500).json({ error: error.message || "Failed to export annotations" });
  }
});

// ── Delete file ───────────────────────────────────────────────────────────────
router.delete("/:projectId/files/:fileId", async (req: AuthRequest, res) => {
  try {
    const file = await fileRepo.findOne({ where: { id: req.params.fileId } });
    if (!file) return res.status(404).json({ error: "File not found" });

    const isLocal = StorageService.storageMode() === "local";
    await StorageService.deleteFile(file.path, isLocal);
    await fileRepo.remove(file);

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

export default router;
