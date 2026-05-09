import { Router, Request, Response } from "express";
import multer from "multer";
import { AppDataSource } from "../database/data-source";
import { Project } from "../entities/Project";
import { Label } from "../entities/Label";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { LabelExtractionService } from "../services/label-extraction";
import * as csv from "csv-parse/sync";

const router = Router();
router.use(authMiddleware);

const upload = multer({ storage: multer.memoryStorage() });

const projectRepository = AppDataSource.getRepository(Project);
const labelRepository = AppDataSource.getRepository(Label);
const labelExtractionService = new LabelExtractionService();

// Extract labels from uploaded file without creating them
router.post("/:projectId/extract-labels", upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const projectId = req.params.projectId;
    const { format } = req.query;

    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const project = await projectRepository.findOne({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const fileContent = req.file.buffer.toString("utf-8");
    let data;

    try {
      if (format === "csv") {
        data = csv.parse(fileContent, { columns: true });
      } else {
        data = JSON.parse(fileContent);
      }
    } catch (parseError) {
      return res.status(400).json({ error: "Failed to parse file" });
    }

    // Extract labels
    const extractedLabels = LabelExtractionService.extractLabels(data, format as string, {
      classNames: req.body.classNames,
      labelField: req.body.labelField,
    });

    res.json({
      message: "Labels extracted successfully",
      format,
      extracted_labels: extractedLabels,
      count: extractedLabels.length,
      preview: extractedLabels.slice(0, 10),
    });
  } catch (error) {
    console.error("Label extraction error:", error);
    res.status(500).json({ error: "Failed to extract labels" });
  }
});

// Create labels automatically from uploaded file
router.post("/:projectId/auto-create-labels", upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const projectId = req.params.projectId;
    const { format } = req.query;

    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const project = await projectRepository.findOne({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const fileContent = req.file.buffer.toString("utf-8");
    let data;

    try {
      if (format === "csv") {
        data = csv.parse(fileContent, { columns: true });
      } else {
        data = JSON.parse(fileContent);
      }
    } catch (parseError) {
      return res.status(400).json({ error: "Failed to parse file" });
    }

    // Extract labels
    const extractedLabels = LabelExtractionService.extractLabels(data, format as string, {
      classNames: req.body.classNames,
      labelField: req.body.labelField,
    });

    if (extractedLabels.length === 0) {
      return res.status(400).json({ error: "No labels found in file" });
    }

    // Create labels in database
    const createdLabels = await labelExtractionService.createLabelsForProject(projectId, extractedLabels);

    res.status(201).json({
      message: "Labels created automatically",
      format,
      created_count: createdLabels.length,
      labels: createdLabels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        source: l.source,
        category: l.category,
      })),
    });
  } catch (error) {
    console.error("Auto-create labels error:", error);
    res.status(500).json({ error: "Failed to create labels" });
  }
});

// Create labels from text list
router.post("/:projectId/create-labels-from-list", async (req: AuthRequest, res) => {
  try {
    const projectId = req.params.projectId;
    const { labels: labelList, auto_assign_colors = true } = req.body;

    if (!labelList || !Array.isArray(labelList)) {
      return res.status(400).json({ error: "Labels list is required" });
    }

    const project = await projectRepository.findOne({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const extractedLabels = labelList.map((label: string | { name: string; color?: string }) => {
      const name = typeof label === "string" ? label : label.name;
      return {
        name,
        count: 0,
        color:
          typeof label === "string" || !label.color
            ? LabelExtractionService["generateColor"]?.() || "#FF6B6B"
            : label.color,
        metadata: {
          source_format: "manual",
        },
      };
    });

    const createdLabels = await labelExtractionService.createLabelsForProject(projectId, extractedLabels);

    res.status(201).json({
      message: "Labels created successfully",
      created_count: createdLabels.length,
      labels: createdLabels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        source: l.source,
      })),
    });
  } catch (error) {
    console.error("Create labels from list error:", error);
    res.status(500).json({ error: "Failed to create labels" });
  }
});

// Get all labels for project
router.get("/:projectId", async (req: AuthRequest, res) => {
  try {
    const projectId = req.params.projectId;

    const labels = await labelRepository.find({
      where: { project: { id: projectId } },
      order: { name: "ASC" },
    });

    res.json({
      count: labels.length,
      labels: labels.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        color: l.color,
        type: l.type || "any",
        attributes: l.attributes || [],
        source: l.source,
        category: l.category,
        usage_count: l.usageCount,
        metadata: l.metadata,
      })),
    });
  } catch (error) {
    console.error("Get labels error:", error);
    res.status(500).json({ error: "Failed to fetch labels" });
  }
});

// Get label statistics
router.get("/:projectId/stats", async (req: AuthRequest, res) => {
  try {
    const projectId = req.params.projectId;
    const stats = await labelExtractionService.getLabelStats(projectId);
    res.json(stats);
  } catch (error) {
    console.error("Get label stats error:", error);
    res.status(500).json({ error: "Failed to fetch label statistics" });
  }
});

// Create/update single label
router.post("/:projectId/create", async (req: AuthRequest, res) => {
  try {
    const projectId = req.params.projectId;
    const { name, description, color, category, type, attributes, metadata } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Label name is required" });
    }

    const project = await projectRepository.findOne({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if label already exists
    const existingLabel = await labelRepository.findOne({
      where: { project: { id: projectId }, name },
    });

    if (existingLabel) {
      return res.status(409).json({ error: "Label already exists" });
    }

    const label = labelRepository.create({
      name,
      description,
      color: color || LabelExtractionService["generateColor"]?.() || "#FF6B6B",
      category: category || "general",
      type: type || "any",
      attributes: attributes || [],
      metadata: metadata || null,
      source: "user_created",
      project: { id: projectId } as any,
    });

    const saved = await labelRepository.save(label);

    // Add to project labelSet
    if (!project.labelSet.includes(name)) {
      project.labelSet = [...project.labelSet, name];
      await projectRepository.save(project);
    }

    res.status(201).json({
      message: "Label created successfully",
      label: {
        id: saved.id,
        name: saved.name,
        color: saved.color,
        type: saved.type,
        attributes: saved.attributes,
        metadata: saved.metadata,
        source: saved.source,
      },
    });
  } catch (error) {
    console.error("Create label error:", error);
    res.status(500).json({ error: "Failed to create label" });
  }
});

// Update label
router.patch("/:projectId/labels/:labelId", async (req: AuthRequest, res) => {
  try {
    const { labelId } = req.params;
    const { name, description, color, category, type, attributes, metadata } = req.body;

    const label = await labelRepository.findOne({ where: { id: labelId } });
    if (!label) {
      return res.status(404).json({ error: "Label not found" });
    }

    if (name) label.name = name;
    if (description) label.description = description;
    if (color) label.color = color;
    if (category) label.category = category;
    if (type) label.type = type;
    if (attributes !== undefined) label.attributes = attributes;
    if (metadata !== undefined) label.metadata = metadata;

    const updated = await labelRepository.save(label);

    res.json({
      message: "Label updated successfully",
      label: {
        id: updated.id,
        name: updated.name,
        color: updated.color,
        type: updated.type,
        attributes: updated.attributes,
        metadata: updated.metadata,
        source: updated.source,
      },
    });
  } catch (error) {
    console.error("Update label error:", error);
    res.status(500).json({ error: "Failed to update label" });
  }
});

// Delete label
router.delete("/:projectId/labels/:labelId", async (req: AuthRequest, res) => {
  try {
    const { projectId, labelId } = req.params;

    const label = await labelRepository.findOne({ where: { id: labelId } });
    if (!label) {
      return res.status(404).json({ error: "Label not found" });
    }

    await labelRepository.remove(label);

    // Remove from project labelSet
    const project = await projectRepository.findOne({ where: { id: projectId } });
    if (project) {
      project.labelSet = project.labelSet.filter((l) => l !== label.name);
      await projectRepository.save(project);
    }

    res.json({ message: "Label deleted successfully" });
  } catch (error) {
    console.error("Delete label error:", error);
    res.status(500).json({ error: "Failed to delete label" });
  }
});

// Merge duplicate labels
router.post("/:projectId/merge-duplicates", async (req: AuthRequest, res) => {
  try {
    const projectId = req.params.projectId;

    const result = await labelExtractionService.mergeDuplicateLabels(projectId);

    res.json({
      message: result.message,
      merged_count: result.merged,
    });
  } catch (error) {
    console.error("Merge duplicates error:", error);
    res.status(500).json({ error: "Failed to merge duplicates" });
  }
});

// Bulk import labels from format
router.post("/:projectId/bulk-import-labels", upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const projectId = req.params.projectId;
    const { format, merge_duplicates = true } = req.query;

    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const project = await projectRepository.findOne({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const fileContent = req.file.buffer.toString("utf-8");
    let data;

    try {
      if (format === "csv") {
        data = csv.parse(fileContent, { columns: true });
      } else {
        data = JSON.parse(fileContent);
      }
    } catch (parseError) {
      return res.status(400).json({ error: "Failed to parse file" });
    }

    // Extract labels
    const extractedLabels = LabelExtractionService.extractLabels(data, format as string, {
      classNames: req.body.classNames,
      labelField: req.body.labelField,
    });

    if (extractedLabels.length === 0) {
      return res.status(400).json({ error: "No labels found in file" });
    }

    // Create labels
    const createdLabels = await labelExtractionService.createLabelsForProject(projectId, extractedLabels);

    // Optionally merge duplicates
    let mergeResult = null;
    if (merge_duplicates === "true") {
      mergeResult = await labelExtractionService.mergeDuplicateLabels(projectId);
    }

    res.status(201).json({
      message: "Labels imported successfully",
      format,
      created_count: createdLabels.length,
      merged_count: mergeResult?.merged || 0,
      labels: createdLabels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        source: l.source,
        category: l.category,
      })),
    });
  } catch (error) {
    console.error("Bulk import labels error:", error);
    res.status(500).json({ error: "Failed to import labels" });
  }
});

export default router;
