# Dataset Formats Comparison Chart

## Comprehensive Format Support Matrix

### Overview Table

| Format | Type | Dimensions | Segmentation | Tracking | Video | 3D Support | Use Case |
|--------|------|-----------|--------------|----------|-------|-----------|----------|
| COCO | Detection | 2D | Instance | ❌ | ❌ | ❌ | General object detection |
| Pascal VOC | Detection | 2D | Instance | ❌ | ❌ | ❌ | Legacy detection |
| YOLO | Detection | 2D | ❌ | ❌ | ❌ | ❌ | Real-time detection |
| KITTI | Detection | 2D+3D | ❌ | ✓ | ❌ | ✓ | Autonomous driving |
| COCO Panoptic | Segmentation | 2D | Instance+Semantic | ❌ | ❌ | ❌ | Panoptic segmentation |
| Cityscapes | Segmentation | 2D | Instance+Semantic | ❌ | ❌ | ❌ | Urban scenes |
| LabelImg | Detection | 2D | ❌ | ❌ | ❌ | ❌ | Desktop annotation tool |
| CVAT | Multi-type | 2D | ✓ | ✓ | ✓ | ❌ | Video annotation |
| Keypoint | Landmarks | 2D | ❌ | ❌ | ❌ | ✓ | Pose estimation |
| Point Cloud | 3D Detection | 3D | ❌ | ❌ | ❌ | ✓ | LiDAR annotation |
| Multi-view | Stereo | 2D+3D | ❌ | ❌ | ❌ | ✓ | Multi-camera systems |
| Video Frame | Tracking | 2D | ❌ | ✓ | ✓ | ❌ | Video object tracking |
| Weak Supervision | Classification | 2D | Partial | ❌ | ❌ | ❌ | Noisy labels |
| CSV | Classification | 2D | ❌ | ❌ | ❌ | ❌ | Tabular data |
| JSON | Custom | Variable | Variable | Variable | Variable | Variable | Any custom format |

## Detailed Feature Comparison

### Detection Formats

#### COCO JSON
```
Coordinate System:  Pixel-based
Annotation Types:   Bounding boxes, Polygons
Instance Support:   Yes
Stuff Categories:   No
3D Support:         No
Standard Usage:     MS COCO, OpenImages
File Size:          Medium
Complexity:         Medium
```

#### KITTI
```
Coordinate System:  Pixel-based + 3D world coordinates
Annotation Types:   2D+3D Bounding boxes, Points
Instance Support:   Yes
Stuff Categories:   No
3D Support:         Yes
Standard Usage:     KITTI Dataset, Autonomous driving
File Size:          Medium
Complexity:         High
```

#### YOLO
```
Coordinate System:  Normalized (0-1)
Annotation Types:   Bounding boxes only
Instance Support:   No
Stuff Categories:   No
3D Support:         No
Standard Usage:     YOLOv5, YOLOv8
File Size:          Small
Complexity:         Low
```

### Segmentation Formats

#### COCO Panoptic
```
Coordinate System:  Pixel-based
Annotation Types:   Instance + Semantic masks
Instance Support:   Yes
Stuff Categories:   Yes (sky, grass, etc.)
3D Support:         No
Standard Usage:     COCO Panoptic Challenge
File Size:          Large (includes masks)
Complexity:         High
```

#### Cityscapes
```
Coordinate System:  Pixel-based
Annotation Types:   Semantic + Instance masks
Instance Support:   Yes
Stuff Categories:   Yes
3D Support:         No
Standard Usage:     Urban scene understanding
File Size:          Very Large (high-res)
Complexity:         High
```

### Tracking & Video Formats

#### CVAT XML
```
Coordinate System:  Pixel-based
Annotation Types:   Rectangles, Polygons, Polylines, Points, Cuboids
Instance Support:   Yes
Tracking Support:   Yes (Tracks with temporal consistency)
Video Support:      Yes
3D Support:         Limited (Cuboids)
Standard Usage:     Video annotation tool
File Size:          Medium
Complexity:         Very High
```

#### Video Frame
```
Coordinate System:  Pixel-based
Annotation Types:   Bounding boxes with track IDs
Instance Support:   Yes
Tracking Support:   Yes
Video Support:      Yes
3D Support:         No
Standard Usage:     MOT Challenge, Tracking datasets
File Size:          Medium
Complexity:         Medium
```

### 3D & Advanced Formats

#### Point Cloud
```
Coordinate System:  3D world coordinates
Annotation Types:   3D bounding boxes
Instance Support:   Yes
Tracking Support:   No
3D Support:         Yes
Point Cloud Formats: PCD, PLY, BIN
Standard Usage:     KITTI 3D, Waymo, nuScenes
File Size:          Large
Complexity:         High
```

#### Keypoint Detection
```
Coordinate System:  Pixel-based + 2D/3D
Annotation Types:   Points with skeleton
Instance Support:   Yes
Tracking Support:   No
3D Support:         Yes
Standard Usage:     COCO Keypoints, OpenPose
File Size:          Small
Complexity:         Medium
```

#### Multi-view/Stereo
```
Coordinate System:  Multiple 2D + 3D
Annotation Types:   Corresponding points
Instance Support:   Yes
Tracking Support:   No
3D Support:         Yes
Standard Usage:     Multi-camera systems
File Size:          Medium
Complexity:         Very High
```

### Weak Supervision

#### Weak Supervision
```
Coordinate System:  Variable
Annotation Types:   Image labels, Scribbles, Clicks
Instance Support:   Partial
Tracking Support:   No
3D Support:         No
Standard Usage:     Semi-supervised learning
File Size:          Small
Complexity:         Low
```

## Size & Performance Comparison

| Format | File Size (1000 images) | Load Time | Memory | Compression |
|--------|------------------------|-----------|--------|-------------|
| JSON | 2-5 MB | Fast | Low | Good |
| KITTI | 5-10 MB | Fast | Low | Good |
| YOLO | 1-3 MB | Very Fast | Very Low | Excellent |
| COCO | 10-50 MB | Medium | Medium | Good |
| COCO Panoptic | 100-500 MB | Slow | High | Poor |
| Cityscapes | 500+ MB | Very Slow | Very High | Poor |
| CVAT | 20-100 MB | Medium | Medium | Good |
| Point Cloud | 100+ MB | Slow | High | Variable |

## Conversion Compatibility

### What Can Be Converted To What

```
COCO         → YOLO, Pascal VOC
YOLO         → COCO, Pascal VOC
Pascal VOC   → COCO, YOLO
KITTI        → COCO, YOLO (2D only)
Panoptic     → COCO, YOLO (instance only)
CVAT         → COCO, YOLO (for rectangular boxes)
Keypoint     → JSON, COCO (with custom field)
Point Cloud  → COCO-3D (custom format)
```

### Conversion Data Loss

| From | To | Loss |
|------|-----|------|
| COCO | YOLO | Polygon precision |
| YOLO | COCO | Confidence scores |
| CVAT | COCO | Track information |
| Point Cloud | COCO | 3D coordinates |
| KITTI | YOLO | 3D and calibration data |

## Recommended Formats By Use Case

### Computer Vision Tasks

**Object Detection**
- Primary: COCO JSON
- Lightweight: YOLO
- Legacy: Pascal VOC

**Instance Segmentation**
- Primary: COCO Panoptic
- Alternative: CVAT (for video)

**Semantic Segmentation**
- Primary: Cityscapes
- Alternative: COCO Panoptic

**Video Object Tracking**
- Primary: CVAT XML
- Alternative: Video Frame

**Pose Estimation**
- Primary: Keypoint Detection
- Alternative: COCO (with custom fields)

**3D Object Detection**
- Primary: KITTI
- Alternative: Point Cloud

**Autonomous Driving**
- Primary: KITTI (with calibration)
- Alternative: Cityscapes (planning only)

**Multi-camera Systems**
- Primary: Multi-view
- Alternative: Custom JSON

**Weakly Supervised**
- Primary: Weak Supervision
- Alternative: Image-level JSON

## Industry Standard Datasets

| Dataset | Format | Task | Size | Domain |
|---------|--------|------|------|--------|
| MS COCO | COCO | Detection/Segmentation | 330K images | General |
| Pascal VOC | Pascal VOC | Detection | 16K images | General |
| ImageNet | Custom | Classification | 14M images | General |
| KITTI | KITTI | 3D Detection/Tracking | 15K images | Autonomous Driving |
| Cityscapes | Cityscapes | Segmentation | 25K images | Urban Scenes |
| Open Images | COCO-like | Detection/Segmentation | 9M images | General |
| Waymo | KITTI-like | 3D Detection | 200K frames | Autonomous Driving |
| nuScenes | Custom | 3D Detection | 1.4M samples | Autonomous Driving |
| COCO Keypoints | COCO | Pose Estimation | 250K images | Human Pose |
| MOT | Custom | Tracking | 21 sequences | Pedestrian Tracking |

## Migration Guide

### Switching Formats

1. **Export from old format** → JSON
2. **Validate exported data** → Check structure
3. **Convert to new format** → Use converter
4. **Validate new format** → Verify integrity
5. **Import into new tool** → Test with sample

### Common Migrations

```
CVAT → COCO
  1. Export CVAT XML
  2. Convert using extended-formats converter
  3. Import as COCO JSON
  4. Verify annotations match

Pascal VOC → YOLO
  1. Export Pascal VOC XML
  2. Parse bounding boxes
  3. Normalize coordinates
  4. Generate class.txt

KITTI → COCO
  1. Extract 2D annotations from KITTI
  2. Ignore 3D/calibration data
  3. Convert to COCO format
  4. Note: 3D information lost
```

## Quality Considerations

### Format Precision

| Format | Coordinate Precision | Size Precision | Type Precision |
|--------|-------------------|---------------|-|
| COCO | Integer pixels | Integer | String |
| YOLO | Normalized float | Normalized float | String |
| KITTI | Float (world) | Float | String |
| CVAT | Integer pixels | Integer | Integer ID |
| Keypoint | Float pixels | N/A | String |
| Point Cloud | Float (3D) | Float (3D) | Integer |

### Data Integrity Checks

```
Before Import:
  ✓ Validate JSON structure
  ✓ Check coordinate ranges
  ✓ Verify category IDs exist
  ✓ Confirm image paths

After Import:
  ✓ Count annotations
  ✓ Check bounds fit images
  ✓ Verify category distribution
  ✓ Sample visual inspection
```

---

**Last Updated:** May 3, 2026
**Total Formats Supported:** 15+
**Conversion Pairs:** 40+
