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
  static unifiedToCOCO(
    annotations: UnifiedAnnotation[],
    projectName: string = "project",
    imageDimensions?: Record<string, { width: number; height: number }>,
  ): COCODataset {
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
        const dims = imageDimensions?.[ann.fileId] ??
          (ann.data.metadata?.imageWidth
            ? { width: ann.data.metadata.imageWidth as number, height: ann.data.metadata.imageHeight as number }
            : { width: 0, height: 0 });
        images.push({
          id: imageId,
          file_name: ann.fileId,
          height: dims.height,
          width: dims.width,
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

          const catId = categoryMap.get(obj.class)!;
          const imgId = fileMap.get(ann.fileId)!;

          if (obj.bbox) {
            const area = obj.bbox.width * obj.bbox.height;
            const cocoAnn: COCOAnnotation = {
              id: annotationId++,
              image_id: imgId,
              category_id: catId,
              bbox: [obj.bbox.x, obj.bbox.y, obj.bbox.width, obj.bbox.height],
              area,
              iscrowd: 0,
            };
            // Include polygon segmentation when available
            if (obj.coordinates && obj.coordinates.length >= 3) {
              cocoAnn.segmentation = [obj.coordinates.flatMap(p => [p.x, p.y])];
            }
            cocoAnnotations.push(cocoAnn);
          } else if (obj.coordinates && obj.coordinates.length >= 3) {
            // Polygon-only shape — derive bbox from bounding rect of polygon
            const xs = obj.coordinates.map(p => p.x);
            const ys = obj.coordinates.map(p => p.y);
            const x = Math.min(...xs), y = Math.min(...ys);
            const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
            cocoAnnotations.push({
              id: annotationId++,
              image_id: imgId,
              category_id: catId,
              bbox: [x, y, w, h],
              area: w * h,
              iscrowd: 0,
              segmentation: [obj.coordinates.flatMap(p => [p.x, p.y])],
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
  static unifiedToPascalVOC(
    annotations: UnifiedAnnotation[],
    imageDimensions?: Record<string, { width: number; height: number }>,
  ): PascalVOCAnnotation[] {
    const fileMap = new Map<string, PascalVOCAnnotation>();

    annotations.forEach((ann) => {
      if (!fileMap.has(ann.fileId)) {
        const dims = imageDimensions?.[ann.fileId] ??
          (ann.data.metadata?.imageWidth
            ? { width: ann.data.metadata.imageWidth as number, height: ann.data.metadata.imageHeight as number }
            : { width: 0, height: 0 });
        fileMap.set(ann.fileId, {
          filename: ann.fileId,
          width: dims.width,
          height: dims.height,
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
  static unifiedToYOLO(
    annotations: UnifiedAnnotation[],
    imageDimensions?: Record<string, { width: number; height: number }>,
  ): { annotations: YOLOAnnotation[]; classNames: string[] } {
    // Build stable class list in a first pass so class_id never shifts mid-iteration
    const classNames: string[] = [];
    const classIndex = new Map<string, number>();
    for (const ann of annotations) {
      for (const obj of ann.data.objects ?? []) {
        if (!classIndex.has(obj.class)) {
          classIndex.set(obj.class, classNames.length);
          classNames.push(obj.class);
        }
      }
    }

    const yoloAnnotations: YOLOAnnotation[] = [];

    annotations.forEach((ann) => {
      const dims = imageDimensions?.[ann.fileId] ??
        (ann.data.metadata?.imageWidth
          ? { width: ann.data.metadata.imageWidth as number, height: ann.data.metadata.imageHeight as number }
          : { width: 1, height: 1 });
      const imgW = dims.width || 1;
      const imgH = dims.height || 1;

      const yoloAnn: YOLOAnnotation = {
        image_path: ann.fileId,
        annotations: [],
      };

      if (ann.data.objects) {
        ann.data.objects.forEach((obj) => {
          if (obj.bbox) {
            yoloAnn.annotations.push({
              class_id: classIndex.get(obj.class)!,
              x_center: obj.normalized ? obj.bbox.x : obj.bbox.x / imgW,
              y_center: obj.normalized ? obj.bbox.y : obj.bbox.y / imgH,
              width: obj.normalized ? obj.bbox.width : obj.bbox.width / imgW,
              height: obj.normalized ? obj.bbox.height : obj.bbox.height / imgH,
            });
          }
        });
      }

      if (yoloAnn.annotations.length > 0) {
        yoloAnnotations.push(yoloAnn);
      }
    });

    return { annotations: yoloAnnotations, classNames };
  }

  // Validate dataset format
  static validateCOCO(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!data.info) errors.push("Missing 'info' field");
    if (!Array.isArray(data.images)) errors.push("'images' must be an array");
    if (!Array.isArray(data.annotations)) errors.push("'annotations' must be an array");
    if (!Array.isArray(data.categories)) errors.push("'categories' must be an array");

    if (errors.length === 0) {
      const imageIds = new Set(data.images.map((img: any) => img.id));
      const catIds = new Set(data.categories.map((c: any) => c.id));
      for (const ann of data.annotations) {
        if (!imageIds.has(ann.image_id)) errors.push(`Annotation ${ann.id} references unknown image_id ${ann.image_id}`);
        if (!catIds.has(ann.category_id)) errors.push(`Annotation ${ann.id} references unknown category_id ${ann.category_id}`);
        if (Array.isArray(ann.bbox) && ann.bbox.length === 4) {
          if (ann.bbox[2] <= 0 || ann.bbox[3] <= 0) errors.push(`Annotation ${ann.id} has non-positive bbox width/height`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  static validateYOLO(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!Array.isArray(data)) { return { valid: false, errors: ["Data must be an array"] }; }
    data.forEach((item, i) => {
      if (!item.image_path) errors.push(`Item ${i}: missing image_path`);
      if (!Array.isArray(item.annotations)) { errors.push(`Item ${i}: annotations must be an array`); return; }
      item.annotations.forEach((ann: any, j: number) => {
        if (typeof ann.class_id !== "number") errors.push(`Item ${i} ann ${j}: class_id must be a number`);
        const coords = [ann.x_center, ann.y_center, ann.width, ann.height];
        if (coords.some((v: any) => typeof v !== "number")) errors.push(`Item ${i} ann ${j}: coordinate fields must be numbers`);
        if (coords.some((v: number) => v < 0 || v > 1)) errors.push(`Item ${i} ann ${j}: coordinates must be normalised [0, 1]`);
      });
    });
    return { valid: errors.length === 0, errors };
  }

  static validatePascalVOC(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!Array.isArray(data)) { return { valid: false, errors: ["Data must be an array"] }; }
    data.forEach((item, i) => {
      if (!item.filename) errors.push(`Item ${i}: missing filename`);
      if (!Array.isArray(item.objects)) { errors.push(`Item ${i}: objects must be an array`); return; }
      item.objects.forEach((obj: any, j: number) => {
        if (!obj.name) errors.push(`Item ${i} obj ${j}: missing name`);
        if (!obj.bndbox) { errors.push(`Item ${i} obj ${j}: missing bndbox`); return; }
        const { xmin, ymin, xmax, ymax } = obj.bndbox;
        if (xmax <= xmin) errors.push(`Item ${i} obj ${j}: xmax (${xmax}) must be > xmin (${xmin})`);
        if (ymax <= ymin) errors.push(`Item ${i} obj ${j}: ymax (${ymax}) must be > ymin (${ymin})`);
      });
    });
    return { valid: errors.length === 0, errors };
  }

  // Legacy boolean shims — keep for callers that only check truthiness
  static validateCOCOBool(data: any): boolean { return this.validateCOCO(data).valid; }
  static validateYOLOBool(data: any): boolean { return this.validateYOLO(data).valid; }
  static validatePascalVOCBool(data: any): boolean { return this.validatePascalVOC(data).valid; }

  // Detect format from file content
  static detectFormat(content: string): "coco" | "yolo" | "pascal_voc" | "csv" | "json" | null {
    try {
      const data = JSON.parse(content);

      if (this.validateCOCO(data).valid) return "coco";
      if (this.validateYOLO(data).valid) return "yolo";
      if (this.validatePascalVOC(data).valid) return "pascal_voc";

      return "json";
    } catch {
      if (content.includes(",") && content.includes("\n")) {
        return "csv";
      }
      return null;
    }
  }
}
