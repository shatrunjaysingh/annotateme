// COCO Format: Common Objects in Context
// Used for object detection and instance segmentation
export interface COCOImage {
  id: number;
  file_name: string;
  height: number;
  width: number;
}

export interface COCOAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  area: number;
  iscrowd: 0 | 1;
  segmentation?: Array<number[]>;
}

export interface COCOCategory {
  id: number;
  name: string;
  supercategory: string;
}

export interface COCODataset {
  info: {
    description: string;
    version: string;
    year: number;
    date_created: string;
  };
  images: COCOImage[];
  annotations: COCOAnnotation[];
  categories: COCOCategory[];
}

// Pascal VOC Format: Visual Object Classes
export interface PascalVOCObject {
  name: string;
  pose: string;
  truncated: number;
  difficult: number;
  bndbox: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

export interface PascalVOCAnnotation {
  filename: string;
  width: number;
  height: number;
  depth: number;
  objects: PascalVOCObject[];
}

// YOLO Format: You Only Look Once
export interface YOLOAnnotation {
  image_path: string;
  annotations: Array<{
    class_id: number;
    x_center: number; // normalized 0-1
    y_center: number; // normalized 0-1
    width: number; // normalized 0-1
    height: number; // normalized 0-1
  }>;
}

// CSV Format for classification/tagging
export interface CSVAnnotation {
  [key: string]: string | number;
  // Common fields:
  // file_path, class, confidence, label, user, timestamp, etc.
}

// Unified internal format
export interface UnifiedAnnotation {
  id: string;
  fileId: string;
  format: "coco" | "pascal_voc" | "yolo" | "csv" | "json";
  data: {
    objects?: Array<{
      id: string;
      class: string;
      confidence: number;
      bbox?: { x: number; y: number; width: number; height: number };
      coordinates?: { x: number; y: number }[]; // for polygons
      normalized?: boolean;
    }>;
    classification?: string;
    confidence?: number;
    metadata?: Record<string, any>;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class FormatConverter {
  // Convert COCO to Unified Format
  static cocoToUnified(cocoDataset: COCODataset): UnifiedAnnotation[] {
    const imageMap = new Map(cocoDataset.images.map((img) => [img.id, img]));
    const categoryMap = new Map(cocoDataset.categories.map((cat) => [cat.id, cat.name]));

    return cocoDataset.annotations.map((ann, idx) => {
      const image = imageMap.get(ann.image_id)!;
      const [x, y, width, height] = ann.bbox;

      return {
        id: `coco-${ann.id}`,
        fileId: image.file_name,
        format: "coco" as const,
        data: {
          objects: [
            {
              id: `obj-${ann.id}`,
              class: categoryMap.get(ann.category_id) || "unknown",
              confidence: 1.0,
              bbox: {
                x,
                y,
                width,
                height,
              },
              normalized: false,
            },
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
  }

  // Convert Pascal VOC to Unified Format
  static pascalVocToUnified(vocAnnotations: PascalVOCAnnotation[]): UnifiedAnnotation[] {
    return vocAnnotations.flatMap((ann, idx) =>
      ann.objects.map((obj) => {
        const { xmin, ymin, xmax, ymax } = obj.bndbox;

        return {
          id: `voc-${idx}-${ann.objects.indexOf(obj)}`,
          fileId: ann.filename,
          format: "pascal_voc" as const,
          data: {
            objects: [
              {
                id: `obj-${idx}`,
                class: obj.name,
                confidence: 1.0 - obj.difficult,
                bbox: {
                  x: xmin,
                  y: ymin,
                  width: xmax - xmin,
                  height: ymax - ymin,
                },
                normalized: false,
              },
            ],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      })
    );
  }

  // Convert YOLO to Unified Format
  static yoloToUnified(yoloAnnotations: YOLOAnnotation[], classNames: string[]): UnifiedAnnotation[] {
    return yoloAnnotations.map((ann, idx) => ({
      id: `yolo-${idx}`,
      fileId: ann.image_path,
      format: "yolo" as const,
      data: {
        objects: ann.annotations.map((obj, objIdx) => ({
          id: `obj-${objIdx}`,
          class: classNames[obj.class_id] || `class_${obj.class_id}`,
          confidence: 1.0,
          bbox: {
            x: obj.x_center,
            y: obj.y_center,
            width: obj.width,
            height: obj.height,
          },
          normalized: true,
        })),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Convert CSV to Unified Format
  static csvToUnified(csvData: CSVAnnotation[], labelField: string = "label"): UnifiedAnnotation[] {
    return csvData.map((row, idx) => ({
      id: `csv-${idx}`,
      fileId: (row.file_path || row.filename || `row-${idx}`) as string,
      format: "csv" as const,
      data: {
        classification: (row[labelField] || "unknown") as string,
        confidence: (row.confidence || 1.0) as number,
        metadata: row,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Convert Unified to COCO
  static unifiedToCOCO(annotations: UnifiedAnnotation[], projectName: string = "project"): COCODataset {
    const images: COCOImage[] = [];
    const cocoAnnotations: COCOAnnotation[] = [];
    const categories: COCOCategory[] = [];
    const categoryMap = new Map<string, number>();
    const fileMap = new Map<string, number>();

    let imageId = 1;
    let annotationId = 1;
    let categoryId = 1;

    annotations.forEach((ann) => {
      // Add image if not exists
      if (!fileMap.has(ann.fileId)) {
        fileMap.set(ann.fileId, imageId);
        images.push({
          id: imageId,
          file_name: ann.fileId,
          height: 1000,
          width: 1000,
        });
        imageId++;
      }

      // Add categories and annotations
      if (ann.data.objects) {
        ann.data.objects.forEach((obj) => {
          if (!categoryMap.has(obj.class)) {
            categoryMap.set(obj.class, categoryId);
            categories.push({
              id: categoryId,
              name: obj.class,
              supercategory: "annotation",
            });
            categoryId++;
          }

          if (obj.bbox) {
            cocoAnnotations.push({
              id: annotationId++,
              image_id: fileMap.get(ann.fileId)!,
              category_id: categoryMap.get(obj.class)!,
              bbox: [obj.bbox.x, obj.bbox.y, obj.bbox.width, obj.bbox.height],
              area: obj.bbox.width * obj.bbox.height,
              iscrowd: 0,
            });
          }
        });
      }
    });

    return {
      info: {
        description: `AnnotateMe export - ${projectName}`,
        version: "1.0",
        year: new Date().getFullYear(),
        date_created: new Date().toISOString(),
      },
      images,
      annotations: cocoAnnotations,
      categories,
    };
  }

  // Convert Unified to Pascal VOC
  static unifiedToPascalVOC(annotations: UnifiedAnnotation[]): PascalVOCAnnotation[] {
    const fileMap = new Map<string, PascalVOCAnnotation>();

    annotations.forEach((ann) => {
      if (!fileMap.has(ann.fileId)) {
        fileMap.set(ann.fileId, {
          filename: ann.fileId,
          width: 1000,
          height: 1000,
          depth: 3,
          objects: [],
        });
      }

      if (ann.data.objects) {
        ann.data.objects.forEach((obj) => {
          if (obj.bbox) {
            fileMap.get(ann.fileId)!.objects.push({
              name: obj.class,
              pose: "Unspecified",
              truncated: 0,
              difficult: obj.confidence < 0.5 ? 1 : 0,
              bndbox: {
                xmin: Math.round(obj.bbox.x),
                ymin: Math.round(obj.bbox.y),
                xmax: Math.round(obj.bbox.x + obj.bbox.width),
                ymax: Math.round(obj.bbox.y + obj.bbox.height),
              },
            });
          }
        });
      }
    });

    return Array.from(fileMap.values());
  }

  // Convert Unified to YOLO
  static unifiedToYOLO(annotations: UnifiedAnnotation[]): { annotations: YOLOAnnotation[]; classNames: string[] } {
    const classSet = new Set<string>();
    const yoloAnnotations: YOLOAnnotation[] = [];

    annotations.forEach((ann) => {
      const yoloAnn: YOLOAnnotation = {
        image_path: ann.fileId,
        annotations: [],
      };

      if (ann.data.objects) {
        ann.data.objects.forEach((obj) => {
          classSet.add(obj.class);

          if (obj.bbox) {
            yoloAnn.annotations.push({
              class_id: Array.from(classSet).indexOf(obj.class),
              x_center: obj.normalized ? obj.bbox.x : obj.bbox.x / 1000,
              y_center: obj.normalized ? obj.bbox.y : obj.bbox.y / 1000,
              width: obj.normalized ? obj.bbox.width : obj.bbox.width / 1000,
              height: obj.normalized ? obj.bbox.height : obj.bbox.height / 1000,
            });
          }
        });
      }

      if (yoloAnn.annotations.length > 0) {
        yoloAnnotations.push(yoloAnn);
      }
    });

    return {
      annotations: yoloAnnotations,
      classNames: Array.from(classSet),
    };
  }

  // Validate dataset format
  static validateCOCO(data: any): boolean {
    return (
      data.info &&
      Array.isArray(data.images) &&
      Array.isArray(data.annotations) &&
      Array.isArray(data.categories)
    );
  }

  static validateYOLO(data: any): boolean {
    return (
      Array.isArray(data) &&
      data.every(
        (item) =>
          item.image_path &&
          Array.isArray(item.annotations) &&
          item.annotations.every(
            (ann) =>
              typeof ann.class_id === "number" &&
              typeof ann.x_center === "number" &&
              typeof ann.y_center === "number"
          )
      )
    );
  }

  static validatePascalVOC(data: any): boolean {
    return (
      Array.isArray(data) &&
      data.every(
        (item) =>
          item.filename &&
          item.objects &&
          Array.isArray(item.objects) &&
          item.objects.every((obj) => obj.bndbox && obj.name)
      )
    );
  }

  // Detect format from file content
  static detectFormat(content: string): "coco" | "yolo" | "pascal_voc" | "csv" | "json" | null {
    try {
      const data = JSON.parse(content);

      if (this.validateCOCO(data)) return "coco";
      if (this.validateYOLO(data)) return "yolo";
      if (this.validatePascalVOC(data)) return "pascal_voc";

      return "json";
    } catch {
      // Might be CSV
      if (content.includes(",") && content.includes("\n")) {
        return "csv";
      }
      return null;
    }
  }
}
