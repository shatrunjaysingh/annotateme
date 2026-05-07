import { AppDataSource } from "../database/data-source";
import { Label } from "../entities/Label";
import { Project } from "../entities/Project";

export interface ExtractedLabel {
  name: string;
  count: number;
  color?: string;
  category?: string;
  metadata?: Record<string, any>;
}

export class LabelExtractionService {
  private labelRepository = AppDataSource.getRepository(Label);
  private projectRepository = AppDataSource.getRepository(Project);

  // Extract labels from COCO format
  static extractCOCOLabels(cocoData: any): ExtractedLabel[] {
    if (!cocoData.categories || !Array.isArray(cocoData.categories)) {
      return [];
    }

    return cocoData.categories.map((cat: any) => ({
      name: cat.name,
      count: 0, // Will be counted during annotation import
      color: LabelExtractionService.generateColor(),
      category: cat.supercategory || "general",
      metadata: {
        category_id: cat.id,
        source_format: "coco",
      },
    }));
  }

  // Extract labels from Pascal VOC format
  static extractPascalVOCLabels(vocData: any[]): ExtractedLabel[] {
    const labelSet = new Set<string>();

    vocData.forEach((annotation) => {
      if (annotation.objects && Array.isArray(annotation.objects)) {
        annotation.objects.forEach((obj: any) => {
          if (obj.name) {
            labelSet.add(obj.name);
          }
        });
      }
    });

    return Array.from(labelSet).map((label) => ({
      name: label,
      count: 0,
      color: LabelExtractionService.generateColor(),
      metadata: {
        source_format: "pascal_voc",
      },
    }));
  }

  // Extract labels from YOLO format
  static extractYOLOLabels(yoloData: any, classNames?: string[]): ExtractedLabel[] {
    if (!classNames || !Array.isArray(classNames)) {
      return [];
    }

    return classNames.map((className, idx) => ({
      name: className,
      count: 0,
      color: LabelExtractionService.generateColor(),
      metadata: {
        class_id: idx,
        source_format: "yolo",
      },
    }));
  }

  // Extract labels from KITTI format
  static extractKITTILabels(kittiData: any[]): ExtractedLabel[] {
    const labelSet = new Set<string>();

    kittiData.forEach((frame) => {
      if (frame.objects && Array.isArray(frame.objects)) {
        frame.objects.forEach((obj: any) => {
          if (obj.type) {
            labelSet.add(obj.type);
          }
        });
      }
    });

    return Array.from(labelSet).map((label) => ({
      name: label,
      count: 0,
      color: LabelExtractionService.generateColor(),
      category: "3d_object",
      metadata: {
        source_format: "kitti",
        is_3d: true,
      },
    }));
  }

  // Extract labels from COCO Panoptic format
  static extractCOCOPanopticLabels(panopticData: any): ExtractedLabel[] {
    if (!panopticData.categories || !Array.isArray(panopticData.categories)) {
      return [];
    }

    return panopticData.categories.map((cat: any) => ({
      name: cat.name,
      count: 0,
      color: LabelExtractionService.generateColor(),
      category: cat.supercategory || (cat.isthing ? "thing" : "stuff"),
      metadata: {
        category_id: cat.id,
        is_thing: cat.isthing,
        source_format: "coco_panoptic",
      },
    }));
  }

  // Extract labels from CVAT format
  static extractCVATLabels(cvatData: any): ExtractedLabel[] {
    // Assuming CVAT data has task info with labels
    const labelSet = new Set<string>();

    cvatData.forEach((frame: any) => {
      if (frame.shapes && Array.isArray(frame.shapes)) {
        frame.shapes.forEach((shape: any) => {
          // Assuming label_id can be mapped to label name
          if (shape.label) {
            labelSet.add(shape.label);
          }
        });
      }
      if (frame.tracks && Array.isArray(frame.tracks)) {
        frame.tracks.forEach((track: any) => {
          if (track.label) {
            labelSet.add(track.label);
          }
        });
      }
    });

    return Array.from(labelSet).map((label) => ({
      name: label,
      count: 0,
      color: LabelExtractionService.generateColor(),
      metadata: {
        source_format: "cvat",
        support_tracking: true,
      },
    }));
  }

  // Extract labels from CSV format
  static extractCSVLabels(csvData: any[], labelField: string = "label"): ExtractedLabel[] {
    const labelSet = new Set<string>();

    csvData.forEach((row) => {
      if (row[labelField]) {
        labelSet.add(String(row[labelField]));
      }
    });

    return Array.from(labelSet).map((label) => ({
      name: label,
      count: 0,
      color: LabelExtractionService.generateColor(),
      metadata: {
        source_format: "csv",
        field_name: labelField,
      },
    }));
  }

  // Extract labels from Keypoint format
  static extractKeypointLabels(keypointData: any[]): ExtractedLabel[] {
    const labelSet = new Set<string>();

    keypointData.forEach((ann) => {
      if (ann.keypoints && Array.isArray(ann.keypoints)) {
        ann.keypoints.forEach((kp: any) => {
          if (kp.name) {
            labelSet.add(kp.name);
          }
        });
      }
    });

    return Array.from(labelSet).map((label) => ({
      name: label,
      count: 0,
      color: LabelExtractionService.generateColor(),
      category: "keypoint",
      metadata: {
        source_format: "keypoint",
        is_keypoint: true,
      },
    }));
  }

  // Extract labels from JSON format (generic)
  static extractJSONLabels(jsonData: any[]): ExtractedLabel[] {
    const labelSet = new Set<string>();

    jsonData.forEach((item) => {
      // Try common label fields
      const labelFields = ["class", "label", "type", "category", "name"];
      labelFields.forEach((field) => {
        if (item[field]) {
          labelSet.add(String(item[field]));
        }
        // Also check in nested objects
        if (item.annotations && Array.isArray(item.annotations)) {
          item.annotations.forEach((ann: any) => {
            if (ann[field]) {
              labelSet.add(String(ann[field]));
            }
          });
        }
      });
    });

    return Array.from(labelSet).map((label) => ({
      name: label,
      count: 0,
      color: LabelExtractionService.generateColor(),
      metadata: {
        source_format: "json",
      },
    }));
  }

  // Extract labels from Point Cloud format
  static extractPointCloudLabels(pcData: any[]): ExtractedLabel[] {
    const labelSet = new Set<string>();

    pcData.forEach((ann) => {
      if (ann.objects && Array.isArray(ann.objects)) {
        ann.objects.forEach((obj: any) => {
          if (obj.type) {
            labelSet.add(obj.type);
          }
        });
      }
    });

    return Array.from(labelSet).map((label) => ({
      name: label,
      count: 0,
      color: LabelExtractionService.generateColor(),
      category: "3d_object",
      metadata: {
        source_format: "point_cloud",
        is_3d: true,
      },
    }));
  }

  // Extract labels from Video Frame format
  static extractVideoFrameLabels(videoData: any[]): ExtractedLabel[] {
    const labelSet = new Set<string>();

    videoData.forEach((frame) => {
      if (frame.annotations && Array.isArray(frame.annotations)) {
        frame.annotations.forEach((ann: any) => {
          if (ann.label) {
            labelSet.add(ann.label);
          }
        });
      }
    });

    return Array.from(labelSet).map((label) => ({
      name: label,
      count: 0,
      color: LabelExtractionService.generateColor(),
      category: "video_object",
      metadata: {
        source_format: "video_frame",
        support_tracking: true,
      },
    }));
  }

  // Extract labels from Weak Supervision format
  static extractWeakSupervisionLabels(wsData: any[]): ExtractedLabel[] {
    const labelSet = new Set<string>();

    wsData.forEach((item) => {
      if (item.image_level_labels && Array.isArray(item.image_level_labels)) {
        item.image_level_labels.forEach((label: string) => {
          labelSet.add(label);
        });
      }
      if (item.scribbles && Array.isArray(item.scribbles)) {
        item.scribbles.forEach((scribble: any) => {
          if (scribble.class) {
            labelSet.add(scribble.class);
          }
        });
      }
      if (item.clicks && Array.isArray(item.clicks)) {
        item.clicks.forEach((click: any) => {
          if (click.class) {
            labelSet.add(click.class);
          }
        });
      }
    });

    return Array.from(labelSet).map((label) => ({
      name: label,
      count: 0,
      color: LabelExtractionService.generateColor(),
      metadata: {
        source_format: "weak_supervision",
      },
    }));
  }

  // Extract labels based on format
  static extractLabels(
    data: any,
    format: string,
    additionalParams?: Record<string, any>
  ): ExtractedLabel[] {
    try {
      switch (format) {
        case "coco":
          return this.extractCOCOLabels(data);
        case "pascal_voc":
          return this.extractPascalVOCLabels(data);
        case "yolo":
          return this.extractYOLOLabels(data, additionalParams?.classNames);
        case "kitti":
          return this.extractKITTILabels(data);
        case "coco_panoptic":
          return this.extractCOCOPanopticLabels(data);
        case "cvat":
          return this.extractCVATLabels(data);
        case "csv":
          return this.extractCSVLabels(data, additionalParams?.labelField || "label");
        case "keypoint":
          return this.extractKeypointLabels(data);
        case "point_cloud":
          return this.extractPointCloudLabels(data);
        case "video_frame":
          return this.extractVideoFrameLabels(data);
        case "weak_supervision":
          return this.extractWeakSupervisionLabels(data);
        case "json":
        default:
          return this.extractJSONLabels(data);
      }
    } catch (error) {
      console.error(`Error extracting labels from ${format} format:`, error);
      return [];
    }
  }

  // Create labels in database
  async createLabelsForProject(
    projectId: string,
    labels: ExtractedLabel[]
  ): Promise<Label[]> {
    const project = await this.projectRepository.findOne({ where: { id: projectId } });
    if (!project) {
      throw new Error("Project not found");
    }

    const createdLabels: Label[] = [];

    for (const labelData of labels) {
      // Check if label already exists
      const existingLabel = await this.labelRepository.findOne({
        where: {
          project: { id: projectId },
          name: labelData.name,
        },
      });

      if (!existingLabel) {
        const label = this.labelRepository.create({
          name: labelData.name,
          description: labelData.name,
          color: labelData.color,
          source: "auto_extracted",
          category: labelData.category || "general",
          metadata: labelData.metadata,
          project: { id: projectId } as any,
        });

        const saved = await this.labelRepository.save(label);
        createdLabels.push(saved);
      } else {
        createdLabels.push(existingLabel);
      }
    }

    // Update project labelSet
    const labelNames = createdLabels.map((l) => l.name);
    project.labelSet = labelNames;
    await this.projectRepository.save(project);

    return createdLabels;
  }

  // Generate random color
  private static generateColor(): string {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#FFA07A",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E2",
      "#F8B88B",
      "#A3E4D7",
      "#FFB6C1",
      "#DDA15E",
      "#BC6C25",
      "#6A994E",
      "#BC4749",
    ];

    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Get label statistics
  async getLabelStats(projectId: string): Promise<any> {
    const labels = await this.labelRepository.find({
      where: { project: { id: projectId } },
    });

    return {
      total_labels: labels.length,
      auto_extracted: labels.filter((l) => l.source === "auto_extracted").length,
      user_created: labels.filter((l) => l.source === "user_created").length,
      by_category: labels.reduce(
        (acc, label) => {
          acc[label.category || "general"] = (acc[label.category || "general"] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      labels: labels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        source: l.source,
        category: l.category,
        usage_count: l.usageCount,
      })),
    };
  }

  // Merge duplicate labels
  async mergeDuplicateLabels(projectId: string): Promise<{ merged: number; message: string }> {
    const labels = await this.labelRepository.find({
      where: { project: { id: projectId } },
    });

    const labelMap = new Map<string, Label>();
    let mergedCount = 0;

    for (const label of labels) {
      const normalizedName = label.name.toLowerCase().trim();

      if (labelMap.has(normalizedName)) {
        // Delete this label, keep the first one
        await this.labelRepository.remove(label);
        mergedCount++;
      } else {
        labelMap.set(normalizedName, label);
      }
    }

    return {
      merged: mergedCount,
      message: `Merged ${mergedCount} duplicate labels`,
    };
  }
}
