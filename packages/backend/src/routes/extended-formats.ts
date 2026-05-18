import { Router, Request, Response } from "express";
import multer from "multer";
import { AppDataSource } from "../database/data-source";
import { Project } from "../entities/Project";
import { Annotation } from "../entities/Annotation";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { S3Service } from "../services/s3.service";
import { FormatConverter } from "../services/format-converter";
import { ExtendedFormatConverter } from "../services/extended-formats";
import * as csv from "csv-parse/sync";

const router = Router();
router.use(authMiddleware);

const upload = multer({ storage: multer.memoryStorage() });

const s3Service = new S3Service({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  region: process.env.AWS_REGION || "us-east-1",
  bucket: process.env.AWS_S3_BUCKET || "annotateme-data",
});

const projectRepository = AppDataSource.getRepository(Project);
const annotationRepository = AppDataSource.getRepository(Annotation);

// Enhanced import with extended formats
router.post("/:projectId/import-extended", upload.single("file"), async (req: AuthRequest, res) => {
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
    const detectedFormat = format || detectExtendedFormat(fileContent);

    if (!detectedFormat) {
      return res.status(400).json({ error: "Could not detect file format" });
    }

    let unifiedAnnotations = [];

    try {
      switch (detectedFormat) {
        case "kitti":
          const kittiData = JSON.parse(fileContent);
          if (!ExtendedFormatConverter.validateKITTI(kittiData)) {
            return res.status(400).json({ error: "Invalid KITTI format" });
          }
          unifiedAnnotations = ExtendedFormatConverter.kittiToUnified(kittiData);
          break;

        case "coco_panoptic":
          const panopticData = JSON.parse(fileContent);
          if (!ExtendedFormatConverter.validateCOCOPanoptic(panopticData)) {
            return res.status(400).json({ error: "Invalid COCO Panoptic format" });
          }
          unifiedAnnotations = ExtendedFormatConverter.cocoPanopticToUnified(panopticData);
          break;

        case "cvat":
          const cvatData = JSON.parse(fileContent);
          if (!ExtendedFormatConverter.validateCVAT(cvatData)) {
            return res.status(400).json({ error: "Invalid CVAT format" });
          }
          unifiedAnnotations = ExtendedFormatConverter.cvatToUnified(cvatData);
          break;

        case "keypoint":
          const keypointData = JSON.parse(fileContent);
          unifiedAnnotations = ExtendedFormatConverter.keypointToUnified(keypointData);
          break;

        case "point_cloud":
          const pcData = JSON.parse(fileContent);
          unifiedAnnotations = ExtendedFormatConverter.pointCloudToUnified(pcData);
          break;

        case "video_frame":
          const videoData = JSON.parse(fileContent);
          unifiedAnnotations = ExtendedFormatConverter.videoFrameToUnified(videoData);
          break;

        case "weak_supervision":
          const wsData = JSON.parse(fileContent);
          unifiedAnnotations = ExtendedFormatConverter.weakSupervisionToUnified(wsData);
          break;

        default:
          return res.status(400).json({ error: "Unsupported format" });
      }
    } catch (parseError) {
      return res.status(400).json({ error: "Failed to parse file format" });
    }

    // Save annotations to database
    const savedAnnotations = [];
    for (const unified of unifiedAnnotations) {
      const annotation = annotationRepository.create({
        fileId: unified.fileId,
        data: unified.data,
        project: { id: projectId } as any,
      });
      const saved = await annotationRepository.save(annotation);
      savedAnnotations.push(saved);
    }

    // Update project metrics
    project.annotatedItems += unifiedAnnotations.length;
    project.progress = Math.round((project.annotatedItems / project.totalItems) * 100);
    await projectRepository.save(project);

    res.status(200).json({
      message: "Extended format annotations imported successfully",
      format: detectedFormat,
      count: unifiedAnnotations.length,
      annotations: savedAnnotations,
    });
  } catch (error) {
    console.error("Extended import error:", error);
    res.status(500).json({ error: "Extended format import failed" });
  }
});

// List supported formats endpoint
router.get("/formats/supported", (req: AuthRequest, res) => {
  res.json({
    basic_formats: [
      {
        name: "COCO JSON",
        value: "coco",
        description: "Common Objects in Context - Object detection and instance segmentation",
        support_level: "full",
      },
      {
        name: "Pascal VOC",
        value: "pascal_voc",
        description: "Visual Object Classes - Bounding box annotations",
        support_level: "full",
      },
      {
        name: "YOLO",
        value: "yolo",
        description: "You Only Look Once - Real-time object detection with normalized coordinates",
        support_level: "full",
      },
      {
        name: "CSV",
        value: "csv",
        description: "Comma-Separated Values - Classification and tagging",
        support_level: "full",
      },
      {
        name: "JSON",
        value: "json",
        description: "Generic JSON format - Custom flexible format",
        support_level: "full",
      },
    ],
    extended_formats: [
      {
        name: "KITTI",
        value: "kitti",
        description:
          "Autonomous driving dataset - 3D object detection, tracking, raw sensor data",
        support_level: "full",
        features: ["3D bounding boxes", "Calibration data", "Truncation/occlusion flags"],
      },
      {
        name: "COCO Panoptic",
        value: "coco_panoptic",
        description: "Instance and semantic segmentation - Panoptic segmentation annotations",
        support_level: "full",
        features: ["Instance masks", "Semantic segmentation", "Stuff and things"],
      },
      {
        name: "Cityscapes",
        value: "cityscapes",
        description: "Urban scene understanding - Semantic and instance segmentation for autonomous driving",
        support_level: "full",
        features: ["Semantic segmentation", "Instance IDs", "Coarse annotations"],
      },
      {
        name: "LabelImg XML",
        value: "labelimg_xml",
        description: "LabelImg tool format - Pascal VOC compatible XML annotations",
        support_level: "full",
        features: ["Bounding boxes", "Difficult flag", "Pose annotations"],
      },
      {
        name: "CVAT XML",
        value: "cvat_xml",
        description: "Computer Vision Annotation Tool - Comprehensive annotation format with tracks",
        support_level: "full",
        features: ["Tracks", "Shapes", "Attributes", "Multiple annotation types"],
      },
      {
        name: "Keypoint Detection",
        value: "keypoint",
        description: "Pose estimation and keypoint detection - 2D/3D keypoint annotations",
        support_level: "full",
        features: ["Skeleton structure", "Visibility flags", "Confidence scores"],
      },
      {
        name: "3D Point Cloud",
        value: "point_cloud",
        description: "3D object detection in point clouds - PCD, PLY, BIN formats",
        support_level: "full",
        features: ["3D bounding boxes", "Multiple formats", "Confidence scores"],
      },
      {
        name: "Multi-view/Stereo",
        value: "multi_view",
        description: "Multi-camera and stereo annotations - Camera calibration and correspondences",
        support_level: "full",
        features: ["Camera matrices", "Point correspondences", "Epipolar geometry"],
      },
      {
        name: "Video Frame",
        value: "video_frame",
        description: "Video object tracking - Frame-by-frame annotations with track IDs",
        support_level: "full",
        features: ["Track IDs", "Temporal consistency", "FPS information"],
      },
      {
        name: "Weak Supervision",
        value: "weak_supervision",
        description: "Weakly labeled data - Image-level labels, scribbles, and clicks",
        support_level: "full",
        features: ["Image-level labels", "Scribble annotations", "Click supervision"],
      },
    ],
  });
});

// Format conversion utility endpoint
router.post("/:projectId/convert-format", async (req: AuthRequest, res) => {
  try {
    const projectId = req.params.projectId;
    const { fromFormat, toFormat } = req.body;

    const project = await projectRepository.findOne({
      where: { id: projectId },
      relations: ["annotations"],
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const annotations = await annotationRepository.find({
      where: { project: { id: projectId } },
    });

    // Convert annotations
    let converted;
    switch (toFormat) {
      case "coco":
        const unifiedAnnotations = annotations.map((ann, idx) => ({
          id: ann.id,
          fileId: ann.fileId,
          format: fromFormat,
          data: ann.data,
          createdAt: ann.createdAt,
          updatedAt: ann.updatedAt,
        }));
        converted = FormatConverter.unifiedToCOCO(unifiedAnnotations, project.name);
        break;

      case "pascal_voc":
        converted = FormatConverter.unifiedToPascalVOC(
          annotations.map((ann) => ({
            id: ann.id,
            fileId: ann.fileId,
            format: fromFormat,
            data: ann.data,
            createdAt: ann.createdAt,
            updatedAt: ann.updatedAt,
          }))
        );
        break;

      case "yolo":
        converted = FormatConverter.unifiedToYOLO(
          annotations.map((ann) => ({
            id: ann.id,
            fileId: ann.fileId,
            format: fromFormat,
            data: ann.data,
            createdAt: ann.createdAt,
            updatedAt: ann.updatedAt,
          }))
        );
        break;

      default:
        return res.status(400).json({ error: "Unsupported target format" });
    }

    // Upload converted data to S3
    const convertedBuffer = Buffer.from(JSON.stringify(converted, null, 2));
    const s3Key = await s3Service.uploadAnnotationSet(
      convertedBuffer,
      `converted-${toFormat}.json`,
      projectId,
      toFormat
    );

    const signedUrl = await s3Service.getSignedDownloadUrl(s3Key, 86400);

    res.json({
      message: "Format conversion successful",
      fromFormat,
      toFormat,
      count: annotations.length,
      downloadUrl: signedUrl,
      s3Key,
    });
  } catch (error) {
    console.error("Format conversion error:", error);
    res.status(500).json({ error: "Format conversion failed" });
  }
});

// Batch format information
router.post("/formats/info", (req: AuthRequest, res) => {
  const { formats } = req.body;

  const formatInfo: Record<string, any> = {
    coco: {
      name: "COCO JSON",
      extensions: [".json"],
      use_cases: ["Object detection", "Instance segmentation"],
      example_fields: ["info", "images", "annotations", "categories"],
    },
    kitti: {
      name: "KITTI",
      extensions: [".txt", ".json"],
      use_cases: ["3D object detection", "Autonomous driving", "Tracking"],
      example_fields: ["objects", "calibration", "imu_data"],
      capabilities: {
        "3d_detection": true,
        "2d_detection": true,
        tracking: true,
        calibration: true,
      },
    },
    coco_panoptic: {
      name: "COCO Panoptic",
      extensions: [".json", ".png"],
      use_cases: ["Panoptic segmentation", "Semantic segmentation"],
      example_fields: ["images", "annotations", "categories"],
      capabilities: {
        instance_segmentation: true,
        semantic_segmentation: true,
        stuff_and_things: true,
      },
    },
    cvat_xml: {
      name: "CVAT XML",
      extensions: [".xml"],
      use_cases: ["Video annotation", "Object tracking", "Complex scenarios"],
      example_fields: ["task", "image", "track", "shape"],
      capabilities: {
        tracks: true,
        shapes: true,
        video: true,
        attributes: true,
      },
    },
    keypoint: {
      name: "Keypoint Detection",
      extensions: [".json"],
      use_cases: ["Pose estimation", "Keypoint detection"],
      example_fields: ["keypoints", "skeleton"],
      capabilities: {
        keypoints_2d: true,
        keypoints_3d: true,
        skeleton: true,
      },
    },
    point_cloud: {
      name: "3D Point Cloud",
      extensions: [".pcd", ".ply", ".bin"],
      use_cases: ["3D object detection", "LiDAR data"],
      example_fields: ["objects", "point_cloud_format"],
      capabilities: {
        "3d_detection": true,
        "3d_bbox": true,
        rotation: true,
      },
    },
  };

  const result: Record<string, any> = {};
  formats.forEach((format: string) => {
    result[format] = formatInfo[format] || { error: "Unknown format" };
  });

  res.json(result);
});

function detectExtendedFormat(content: string): string | null {
  const basicDetected = detectBasicFormat(content);
  if (basicDetected) return basicDetected;

  const extendedDetected = ExtendedFormatConverter.detectExtendedFormat(content);
  return extendedDetected;
}

function detectBasicFormat(content: string): string | null {
  try {
    const data = JSON.parse(content);

    if (FormatConverter.validateCOCO(data).valid) return "coco";
    if (FormatConverter.validateYOLO(data).valid) return "yolo";
    if (FormatConverter.validatePascalVOC(data).valid) return "pascal_voc";

    return "json";
  } catch {
    if (content.includes(",") && content.includes("\n")) {
      return "csv";
    }
    return null;
  }
}

export default router;
