# Extended Dataset Formats Support for AnnotateMe

AnnotateMe now supports 15+ industry-standard dataset formats including KITTI, COCO Panoptic, Cityscapes, and more.

## Supported Formats Overview

### Basic Formats (5)
1. **COCO JSON** - Object detection, instance segmentation
2. **Pascal VOC** - Bounding box annotations
3. **YOLO** - Real-time object detection
4. **CSV** - Classification, tagging
5. **JSON** - Custom flexible format

### Extended Formats (10+)

| Format | Best For | Features |
|--------|----------|----------|
| **KITTI** | Autonomous driving, 3D detection | 3D boxes, calibration, occlusion/truncation |
| **COCO Panoptic** | Panoptic segmentation | Instance + semantic segmentation, stuff/things |
| **Cityscapes** | Urban scene understanding | Semantic segmentation, instance IDs |
| **LabelImg XML** | Legacy XML format | Pascal VOC compatible |
| **CVAT XML** | Video annotation, tracking | Tracks, shapes, attributes |
| **Keypoint Detection** | Pose estimation | Skeleton, visibility, 2D/3D keypoints |
| **3D Point Cloud** | LiDAR, 3D detection | PCD, PLY, BIN formats |
| **Multi-view/Stereo** | Multi-camera systems | Camera matrices, epipolar geometry |
| **Video Frames** | Object tracking | Track IDs, temporal consistency |
| **Weak Supervision** | Weakly labeled data | Image-level labels, scribbles, clicks |

---

## Format Specifications

### KITTI Format
**Best for:** Autonomous driving datasets, 3D object detection, sensor fusion

```json
[
  {
    "image_path": "image_00/data/0000000000.png",
    "objects": [
      {
        "type": "Car",
        "truncated": 0,
        "occluded": 0,
        "alpha": -0.27,
        "bbox": [712.40, 143.00, 810.73, 307.92],
        "dimensions": [1.89, 1.63, 4.13],
        "location": [13.58, 1.57, 46.70],
        "rotation_y": -1.56,
        "score": 0.95
      }
    ],
    "calibration": {
      "p0": [[7.070493e+02, 0.000000e+00, 6.040814e+02, 0.000000e+00, ...]],
      "tr_velo_to_cam": [[...]]
    }
  }
]
```

**Key Fields:**
- `type` - Object class (Car, Pedestrian, Cyclist, etc.)
- `truncated` - Truncation level (0-1)
- `occluded` - Occlusion level (0-3)
- `alpha` - Observation angle
- `bbox` - 2D bounding box [left, top, right, bottom]
- `dimensions` - 3D size [height, width, length]
- `location` - 3D position [x, y, z]
- `rotation_y` - Rotation around Y-axis
- `calibration` - Camera calibration matrices

**Use Cases:**
- Autonomous driving (KITTI dataset)
- 3D object detection
- Multi-sensor fusion
- Vehicle tracking

---

### COCO Panoptic Format
**Best for:** Instance and semantic segmentation, panoptic segmentation

```json
{
  "info": {
    "description": "Panoptic segmentation dataset",
    "version": "1.0",
    "year": 2024,
    "date_created": "2024-05-03T00:00:00Z"
  },
  "images": [
    {
      "id": 1,
      "file_name": "image.jpg",
      "height": 480,
      "width": 640
    }
  ],
  "annotations": [
    {
      "image_id": 1,
      "file_name": "panoptic/image.png",
      "segments_info": [
        {
          "id": 1,
          "category_id": 1,
          "area": 50000,
          "bbox": [100, 100, 200, 150],
          "iscrowd": 0
        }
      ]
    }
  ],
  "categories": [
    {
      "id": 1,
      "name": "person",
      "supercategory": "human",
      "isthing": 1
    },
    {
      "id": 2,
      "name": "sky",
      "supercategory": "scene",
      "isthing": 0
    }
  ]
}
```

**Key Features:**
- `isthing` - 1 for countable objects, 0 for stuff
- Segment maps (PNG with encoded IDs)
- Unified instance and semantic segmentation

---

### Cityscapes Format
**Best for:** Urban scene understanding, autonomous driving

```json
{
  "imgWidth": 2048,
  "imgHeight": 1024,
  "objects": [
    {
      "label": "car",
      "instanceId": 1001,
      "color": [0, 0, 142]
    }
  ],
  "segmentationData": "base64_encoded_png"
}
```

**Key Features:**
- Semantic and instance segmentation
- Color-coded labels
- Instance IDs for tracking
- High-resolution images (2048x1024)

---

### CVAT XML Format
**Best for:** Video annotation, complex scenarios, multi-shape annotations

```json
[
  {
    "index": 0,
    "name": "frame_0000.jpg",
    "width": 640,
    "height": 480,
    "shapes": [
      {
        "type": "rect",
        "label_id": 1,
        "occluded": 0,
        "points": "100,100,300,300",
        "attributes": [
          {
            "id": 1,
            "value": "moving"
          }
        ]
      }
    ],
    "tracks": [
      {
        "id": 1,
        "label_id": 1,
        "shapes": [
          {
            "frame": 0,
            "type": "rect",
            "points": "100,100,300,300"
          }
        ]
      }
    ]
  }
]
```

**Supported Shapes:**
- Rectangle (rect)
- Polygon (polygon)
- Polyline (polyline)
- Points (points)
- Cuboid (cuboid)

**Features:**
- Video tracks across frames
- Multiple annotation types
- Attributes and metadata
- Occlusion flags

---

### Keypoint Detection Format
**Best for:** Human pose estimation, landmark detection

```json
[
  {
    "image_path": "image.jpg",
    "keypoints": [
      {
        "id": "1",
        "name": "nose",
        "x": 156.52,
        "y": 123.45,
        "confidence": 0.98,
        "visibility": 2
      }
    ],
    "skeleton": [
      [1, 2],
      [1, 5],
      [5, 6]
    ]
  }
]
```

**Key Fields:**
- `id` - Keypoint identifier
- `name` - Keypoint name (e.g., "left_shoulder")
- `confidence` - Detection confidence
- `visibility` - 0=not visible, 1=occluded, 2=visible
- `skeleton` - Connections between keypoints

**Standard Skeletons:**
- COCO (17 keypoints)
- OpenPose (18/25 keypoints)
- Custom skeletons

---

### 3D Point Cloud Format
**Best for:** LiDAR annotations, 3D object detection

```json
[
  {
    "path": "scene_0001.pcd",
    "format": "pcd",
    "objects": [
      {
        "id": 1,
        "type": "Car",
        "bbox_3d": {
          "center": [10.5, 0.5, 46.7],
          "dimensions": [4.5, 1.9, 1.6],
          "rotation": [0, 0, -1.56]
        },
        "confidence": 0.95
      }
    ]
  }
]
```

**Supported Formats:**
- `.pcd` - Point Cloud Data (PCL)
- `.ply` - Polygon File Format
- `.bin` - Binary format

---

### Video Frame Format
**Best for:** Object tracking, temporal analysis

```json
[
  {
    "video_path": "video.mp4",
    "frame_number": 0,
    "timestamp": 0.0,
    "fps": 30,
    "annotations": [
      {
        "track_id": 1,
        "label": "car",
        "bbox": [100, 100, 200, 150],
        "confidence": 0.95,
        "attributes": {
          "speed": "high",
          "direction": "left"
        }
      }
    ]
  }
]
```

**Features:**
- Track IDs across frames
- Temporal information (fps, timestamp)
- Custom attributes per object
- Frame-level metadata

---

### Weak Supervision Format
**Best for:** Noisy labels, semi-supervised learning

```json
[
  {
    "image_path": "image.jpg",
    "image_level_labels": ["dog", "outdoor"],
    "scribbles": [
      {
        "class": "dog",
        "mask": "base64_encoded_image"
      }
    ],
    "clicks": [
      {
        "x": 150,
        "y": 200,
        "class": "dog"
      }
    ]
  }
]
```

**Features:**
- Image-level labels
- Scribble annotations
- Click-based supervision
- Multiple weak signals

---

## API Endpoints

### Get Supported Formats
```bash
GET /api/formats/supported
```

**Response:**
```json
{
  "basic_formats": [...],
  "extended_formats": [...]
}
```

### Import Extended Format
```bash
POST /api/formats/:projectId/import-extended
Content-Type: multipart/form-data

file: annotations.json
format: kitti  # Optional, auto-detected if not provided
```

### Convert Between Formats
```bash
POST /api/formats/:projectId/convert-format
Content-Type: application/json

{
  "fromFormat": "kitti",
  "toFormat": "coco"
}
```

### Get Format Information
```bash
POST /api/formats/formats/info
Content-Type: application/json

{
  "formats": ["kitti", "coco_panoptic", "cvat"]
}
```

---

## Format Conversion Matrix

| From → To | COCO | YOLO | Pascal VOC | KITTI | Panoptic |
|-----------|------|------|-----------|-------|----------|
| COCO | - | ✓ | ✓ | - | - |
| YOLO | ✓ | - | ✓ | - | - |
| Pascal VOC | ✓ | ✓ | - | - | - |
| KITTI | ✓ | - | ✓ | - | - |
| Panoptic | ✓ | - | ✓ | - | - |

---

## Import Examples

### KITTI Import
```bash
curl -X POST \
  -F "file=@kitti_annotations.json" \
  "http://localhost:3000/api/formats/project-id/import-extended?format=kitti"
```

### COCO Panoptic Import
```bash
curl -X POST \
  -F "file=@panoptic.json" \
  "http://localhost:3000/api/formats/project-id/import-extended?format=coco_panoptic"
```

### CVAT Import
```bash
curl -X POST \
  -F "file=@cvat_annotations.json" \
  "http://localhost:3000/api/formats/project-id/import-extended?format=cvat"
```

---

## Export Examples

### Export to COCO
```bash
curl "http://localhost:3000/api/import-export/project-id/export?format=coco"
```

### Export to KITTI
```bash
# Conversion happens automatically if annotations were imported as KITTI
curl "http://localhost:3000/api/formats/project-id/convert-format" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"fromFormat": "internal", "toFormat": "kitti"}'
```

---

## Best Practices

### Format Selection
- **KITTI** - Autonomous driving, 3D detection
- **COCO Panoptic** - Semantic + instance segmentation
- **Cityscapes** - Urban scenes, high-res segmentation
- **CVAT** - Video, complex multi-shape annotations
- **Keypoint** - Pose estimation, landmarks
- **Point Cloud** - LiDAR, 3D detection
- **YOLO** - Real-time detection, edge deployment

### Data Preparation
1. Validate format before import
2. Check coordinate systems (normalized vs pixel)
3. Verify category names consistency
4. Handle missing fields gracefully

### Performance
- Use compressed formats for large datasets
- Batch import/export operations
- Pre-validate file structure
- Stream large files when possible

---

## Common Issues

### Format Detection Failed
- Ensure JSON is valid
- Check file encoding (UTF-8)
- Provide explicit format parameter

### Coordinate Mismatch
- YOLO uses normalized coordinates (0-1)
- KITTI uses pixel coordinates
- Verify image dimensions

### Category Inconsistency
- Ensure category names match project labels
- Check category IDs are unique
- Validate category hierarchy

---

## References

- [KITTI Dataset](http://www.cvlibs.net/datasets/kitti/)
- [COCO Dataset](https://cocodataset.org/)
- [Cityscapes Dataset](https://www.cityscapes-dataset.com/)
- [CVAT Project](https://github.com/opencv/cvat)
- [COCO Panoptic](https://cocodataset.org/#panoptic-2020)

---

**Last Updated:** May 3, 2026
**Total Supported Formats:** 15+
**Last Tested:** AnnotateMe v1.0.0
