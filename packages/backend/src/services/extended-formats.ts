// Extended format support for AnnotateMe
// Includes KITTI, Cityscapes, COCO Panoptic, LabelImg, CVAT XML, and more

// KITTI Format: Autonomous driving dataset
// For 3D object detection, tracking, and raw sensor data
export interface KITTIObject {
  type: string; // 'Car', 'Pedestrian', 'Cyclist', etc.
  truncated: number; // 0-1, indicates truncation level
  occluded: number; // 0-3, occlusion level
  alpha: number; // observation angle
  bbox: [number, number, number, number]; // left, top, right, bottom
  dimensions: [number, number, number]; // height, width, length (3D)
  location: [number, number, number]; // x, y, z (3D position)
  rotation_y: number; // rotation around y-axis
  score?: number; // confidence score
}

export interface KITTICalibration {
  p0: number[][];
  p1: number[][];
  p2: number[][];
  p3: number[][];
  r0_rect: number[][];
  tr_velo_to_cam: number[][];
  tr_imu_to_velo: number[][];
}

export interface KITTIFrame {
  image_path: string;
  objects: KITTIObject[];
  calibration?: KITTICalibration;
  timestamp?: number;
  imu_data?: Record<string, any>;
}

// COCO Panoptic Format: Instance and semantic segmentation
export interface COCOPanopticSegment {
  id: number;
  category_id: number;
  area: number;
  bbox: [number, number, number, number];
  iscrowd: 0 | 1;
}

export interface COCOPanopticImage {
  id: number;
  file_name: string;
  height: number;
  width: number;
  segments_info: COCOPanopticSegment[];
}

export interface COCOPanopticCategory {
  id: number;
  name: string;
  supercategory: string;
  isthing: 0 | 1; // 1 for thing, 0 for stuff
}

export interface COCOPanopticDataset {
  info: any;
  licenses: any[];
  images: COCOPanopticImage[];
  annotations: Array<{ image_id: number; file_name: string; segments_info: COCOPanopticSegment[] }>;
  categories: COCOPanopticCategory[];
}

// Cityscapes Format: Urban scene understanding
export interface CityscapesObject {
  label: string;
  instanceId: number;
  color: [number, number, number]; // RGB
}

export interface CityscapesAnnotation {
  imgWidth: number;
  imgHeight: number;
  objects: CityscapesObject[];
  segmentationData: Uint8Array; // PNG encoded segmentation
}

// LabelImg XML Format (Pascal VOC XML variant)
export interface LabelImgObject {
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

export interface LabelImgAnnotation {
  filename: string;
  path: string;
  width: number;
  height: number;
  depth: number;
  database: string;
  objects: LabelImgObject[];
}

// CVAT XML Format: Computer Vision Annotation Tool
export interface CVATTask {
  id: number;
  name: string;
  project_id?: number;
  size: number;
  mode: 'annotation' | 'interpolation';
  created: string;
  updated: string;
  overlap: number;
  bugtracker: string;
  flipped: boolean;
}

export interface CVATLabel {
  id: number;
  name: string;
  color: string;
  type: 'rectangle' | 'polygon' | 'polyline' | 'points' | 'cuboid' | 'mask';
  attributes?: Array<{
    id: number;
    name: string;
    mutable: boolean;
    input_type: string;
    default_value: string;
    values: string[];
  }>;
}

export interface CVATImage {
  id: number;
  name: string;
  width: number;
  height: number;
}

export interface CVATAnnotationShape {
  id?: number;
  type: 'rect' | 'polygon' | 'polyline' | 'points' | 'cuboid';
  label_id: number;
  occluded: 0 | 1;
  attributes: Array<{ id: number; value: string }>;
  points?: string; // "x1,y1,x2,y2,..."
}

export interface CVATTrack {
  id: number;
  label_id: number;
  shapes: Array<CVATAnnotationShape & { frame: number }>;
}

export interface CVATFrame {
  index: number;
  name: string;
  width: number;
  height: number;
  shapes: CVATAnnotationShape[];
  tracks: CVATTrack[];
}

// Semantic Segmentation Mask Format
export interface SegmentationMask {
  image_path: string;
  mask_path: string;
  classes: string[];
  color_map?: Record<string, [number, number, number]>; // RGB values for each class
}

// Instance Segmentation Format
export interface InstanceSegmentation {
  image_path: string;
  instances: Array<{
    id: number;
    class_name: string;
    mask: string; // RLE or path
    bbox?: [number, number, number, number];
    area?: number;
  }>;
}

// Keypoint Format (Human pose, etc.)
export interface KeypointAnnotation {
  image_path: string;
  keypoints: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    confidence: number;
    visibility?: number; // 0=not visible, 1=occluded, 2=visible
  }>;
  skeleton?: Array<[number, number]>; // connections between keypoints
}

// 3D Point Cloud Format
export interface PointCloudAnnotation {
  path: string; // Path to .pcd or .ply file
  format: 'pcd' | 'ply' | 'bin'; // Point cloud format
  objects: Array<{
    id: number;
    type: string;
    bbox_3d: {
      center: [number, number, number];
      dimensions: [number, number, number];
      rotation: [number, number, number]; // yaw, pitch, roll
    };
    confidence?: number;
  }>;
}

// Stereo/Multi-view Format
export interface MultiViewAnnotation {
  views: Array<{
    view_id: number;
    image_path: string;
    camera_matrix?: number[][];
    distortion_coefficients?: number[];
    rotation?: number[][];
    translation?: number[];
  }>;
  matches: Array<{
    view1: number;
    view2: number;
    points1: Array<[number, number]>;
    points2: Array<[number, number]>;
  }>;
}

// Video Frame Annotation Format
export interface VideoFrameAnnotation {
  video_path: string;
  frame_number: number;
  timestamp: number;
  fps: number;
  annotations: Array<{
    track_id: number;
    label: string;
    bbox: [number, number, number, number];
    confidence: number;
    attributes?: Record<string, string | number>;
  }>;
}

// Weakly Supervised Format (Image-level labels)
export interface WeakSupervisionAnnotation {
  image_path: string;
  image_level_labels: string[];
  scribbles?: Array<{
    class: string;
    mask: string;
  }>;
  clicks?: Array<{
    x: number;
    y: number;
    class: string;
  }>;
}

export class ExtendedFormatConverter {
  // Convert KITTI to Unified Format
  static kittiToUnified(kittiFrames: KITTIFrame[]): any[] {
    return kittiFrames.map((frame, frameIdx) => ({
      id: `kitti-${frameIdx}`,
      fileId: frame.image_path,
      format: 'kitti',
      data: {
        objects: frame.objects.map((obj, objIdx) => ({
          id: `obj-${objIdx}`,
          type: 'cuboid_3d',
          class: obj.type,
          bbox: {
            x: obj.bbox[0],
            y: obj.bbox[1],
            width: obj.bbox[2] - obj.bbox[0],
            height: obj.bbox[3] - obj.bbox[1],
          },
          bbox_3d: {
            center: obj.location,
            dimensions: obj.dimensions,
            rotation_y: obj.rotation_y,
          },
          metadata: {
            truncated: obj.truncated,
            occluded: obj.occluded,
            alpha: obj.alpha,
            confidence: obj.score || 1.0,
          },
        })),
        calibration: frame.calibration,
        timestamp: frame.timestamp,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Convert COCO Panoptic to Unified Format
  static cocoPanopticToUnified(panopticDataset: COCOPanopticDataset): any[] {
    const imageMap = new Map(panopticDataset.images.map((img) => [img.id, img]));
    const categoryMap = new Map(panopticDataset.categories.map((cat) => [cat.id, cat]));

    return panopticDataset.annotations.map((ann, idx) => {
      const image = imageMap.get(ann.image_id)!;

      return {
        id: `coco-panoptic-${idx}`,
        fileId: image.file_name,
        format: 'coco_panoptic',
        data: {
          type: 'panoptic_segmentation',
          segments: ann.segments_info.map((seg) => {
            const cat = categoryMap.get(seg.category_id)!;
            return {
              id: seg.id,
              category_id: seg.category_id,
              category_name: cat.name,
              is_thing: cat.isthing,
              area: seg.area,
              bbox: {
                x: seg.bbox[0],
                y: seg.bbox[1],
                width: seg.bbox[2],
                height: seg.bbox[3],
              },
            };
          }),
          annotation_file: ann.file_name,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
  }

  // Convert Cityscapes to Unified Format
  static cityscapesToUnified(cityscapesData: CityscapesAnnotation[], imagePaths: string[]): any[] {
    return cityscapesData.map((ann, idx) => ({
      id: `cityscapes-${idx}`,
      fileId: imagePaths[idx] || `image-${idx}`,
      format: 'cityscapes',
      data: {
        type: 'semantic_segmentation',
        width: ann.imgWidth,
        height: ann.imgHeight,
        objects: ann.objects.map((obj) => ({
          label: obj.label,
          instance_id: obj.instanceId,
          color: obj.color,
        })),
        segmentation_map: Buffer.from(ann.segmentationData).toString('base64'),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Convert LabelImg XML to Unified Format
  static labelImgToUnified(labelImgAnnotations: LabelImgAnnotation[]): any[] {
    return labelImgAnnotations.flatMap((ann, idx) =>
      ann.objects.map((obj, objIdx) => ({
        id: `labelimg-${idx}-${objIdx}`,
        fileId: ann.filename,
        format: 'labelimg_xml',
        data: {
          objects: [
            {
              id: `obj-${objIdx}`,
              class: obj.name,
              bbox: {
                x: obj.bndbox.xmin,
                y: obj.bndbox.ymin,
                width: obj.bndbox.xmax - obj.bndbox.xmin,
                height: obj.bndbox.ymax - obj.bndbox.ymin,
              },
              metadata: {
                pose: obj.pose,
                truncated: obj.truncated,
                difficult: obj.difficult,
              },
            },
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
  }

  // Convert CVAT XML to Unified Format
  static cvatToUnified(cvatFrames: CVATFrame[]): any[] {
    return cvatFrames.map((frame) => ({
      id: `cvat-frame-${frame.index}`,
      fileId: frame.name,
      format: 'cvat_xml',
      data: {
        shapes: frame.shapes.map((shape, idx) => ({
          id: `shape-${shape.id || idx}`,
          type: shape.type,
          occluded: shape.occluded,
          points: shape.points?.split(',').map(Number) || [],
          attributes: shape.attributes.map((attr) => ({
            id: attr.id,
            value: attr.value,
          })),
        })),
        tracks: frame.tracks.map((track) => ({
          id: `track-${track.id}`,
          label_id: track.label_id,
          shapes: track.shapes,
        })),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Convert Keypoint to Unified Format
  static keypointToUnified(keypointData: KeypointAnnotation[]): any[] {
    return keypointData.map((ann, idx) => ({
      id: `keypoint-${idx}`,
      fileId: ann.image_path,
      format: 'keypoint',
      data: {
        keypoints: ann.keypoints.map((kp) => ({
          id: kp.id,
          name: kp.name,
          x: kp.x,
          y: kp.y,
          confidence: kp.confidence,
          visibility: kp.visibility || 2,
        })),
        skeleton: ann.skeleton || [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Convert 3D Point Cloud to Unified Format
  static pointCloudToUnified(pcData: PointCloudAnnotation[]): any[] {
    return pcData.map((ann, idx) => ({
      id: `pointcloud-${idx}`,
      fileId: ann.path,
      format: 'point_cloud',
      data: {
        point_cloud_format: ann.format,
        objects: ann.objects.map((obj) => ({
          id: `obj-${obj.id}`,
          type: obj.type,
          bbox_3d: {
            center: obj.bbox_3d.center,
            dimensions: obj.bbox_3d.dimensions,
            rotation: obj.bbox_3d.rotation,
          },
          confidence: obj.confidence || 1.0,
        })),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Convert Multi-view to Unified Format
  static multiViewToUnified(mvData: MultiViewAnnotation[]): any[] {
    return mvData.map((ann, idx) => ({
      id: `multiview-${idx}`,
      fileId: `multiview-${idx}`,
      format: 'multi_view',
      data: {
        views: ann.views.map((view) => ({
          view_id: view.view_id,
          image_path: view.image_path,
          camera_matrix: view.camera_matrix,
          distortion: view.distortion_coefficients,
          pose: {
            rotation: view.rotation,
            translation: view.translation,
          },
        })),
        matches: ann.matches,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Convert Video Frame to Unified Format
  static videoFrameToUnified(videoData: VideoFrameAnnotation[]): any[] {
    return videoData.map((frame, idx) => ({
      id: `video-frame-${frame.frame_number}`,
      fileId: `${frame.video_path}:${frame.frame_number}`,
      format: 'video_frame',
      data: {
        video_path: frame.video_path,
        frame_number: frame.frame_number,
        timestamp: frame.timestamp,
        fps: frame.fps,
        annotations: frame.annotations.map((ann) => ({
          track_id: ann.track_id,
          class: ann.label,
          bbox: {
            x: ann.bbox[0],
            y: ann.bbox[1],
            width: ann.bbox[2],
            height: ann.bbox[3],
          },
          confidence: ann.confidence,
          attributes: ann.attributes || {},
        })),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Convert Weakly Supervised to Unified Format
  static weakSupervisionToUnified(wsData: WeakSupervisionAnnotation[]): any[] {
    return wsData.map((ann, idx) => ({
      id: `weak-supervision-${idx}`,
      fileId: ann.image_path,
      format: 'weak_supervision',
      data: {
        image_level_labels: ann.image_level_labels,
        scribbles: ann.scribbles || [],
        clicks: ann.clicks || [],
        annotation_type: 'weakly_supervised',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Validate KITTI format
  static validateKITTI(data: any): boolean {
    return (
      Array.isArray(data) &&
      data.every(
        (frame) =>
          frame.image_path &&
          Array.isArray(frame.objects) &&
          frame.objects.every((obj) => obj.type && obj.bbox && obj.dimensions && obj.location)
      )
    );
  }

  // Validate COCO Panoptic format
  static validateCOCOPanoptic(data: any): boolean {
    return (
      data.info &&
      Array.isArray(data.images) &&
      Array.isArray(data.annotations) &&
      Array.isArray(data.categories) &&
      data.categories.every((cat) => typeof cat.isthing === 'number')
    );
  }

  // Validate CVAT format
  static validateCVAT(data: any): boolean {
    return (
      Array.isArray(data) &&
      data.every((frame) => typeof frame.index === 'number' && Array.isArray(frame.shapes))
    );
  }

  // Detect format from content
  static detectExtendedFormat(
    content: string
  ): 'kitti' | 'coco_panoptic' | 'cityscapes' | 'labelimg' | 'cvat' | 'keypoint' | 'video' | null {
    try {
      const data = JSON.parse(content);

      if (this.validateKITTI(data)) return 'kitti';
      if (this.validateCOCOPanoptic(data)) return 'coco_panoptic';
      if (this.validateCVAT(data)) return 'cvat';

      return null;
    } catch {
      // Check for XML formats
      if (content.includes('<annotation>') && content.includes('<object>')) {
        if (content.includes('<isthing>')) return 'coco_panoptic';
        return 'labelimg';
      }
      if (content.includes('<task>') && content.includes('<image>')) return 'cvat';

      return null;
    }
  }
}
