# S3 and Dataset Format Integration Guide for AnnotateMe

## Overview

AnnotateMe supports S3/cloud storage integration and multiple popular dataset formats for seamless import/export of annotations.

## Supported Dataset Formats

### 1. COCO (Common Objects in Context)
**Best for:** Object detection, instance segmentation
**File extension:** `.json`

```json
{
  "info": {
    "description": "Dataset description",
    "version": "1.0",
    "year": 2024,
    "date_created": "2024-05-03T00:00:00Z"
  },
  "images": [
    {
      "id": 1,
      "file_name": "image1.jpg",
      "height": 480,
      "width": 640
    }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "bbox": [100, 100, 200, 150],
      "area": 30000,
      "iscrowd": 0
    }
  ],
  "categories": [
    {
      "id": 1,
      "name": "car",
      "supercategory": "vehicle"
    }
  ]
}
```

**Use Cases:**
- Object detection datasets (MS COCO, OpenImagesV4)
- Instance segmentation annotations
- Multi-class object detection

### 2. Pascal VOC (Visual Object Classes)
**Best for:** Object detection with bounding boxes
**File extension:** `.xml` or `.json`

```json
[
  {
    "filename": "image1.jpg",
    "width": 640,
    "height": 480,
    "depth": 3,
    "objects": [
      {
        "name": "car",
        "pose": "Frontal",
        "truncated": 0,
        "difficult": 0,
        "bndbox": {
          "xmin": 100,
          "ymin": 100,
          "xmax": 300,
          "ymax": 250
        }
      }
    ]
  }
]
```

**Use Cases:**
- VOC datasets (PASCAL VOC, ImageNet)
- Bounding box annotations
- General object detection

### 3. YOLO (You Only Look Once)
**Best for:** Real-time object detection, normalized coordinates
**File extension:** `.txt` or `.json`

```json
[
  {
    "image_path": "images/image1.jpg",
    "annotations": [
      {
        "class_id": 0,
        "x_center": 0.5,
        "y_center": 0.5,
        "width": 0.3,
        "height": 0.4
      }
    ]
  }
]
```

**Use Cases:**
- YOLOv5, YOLOv8 datasets
- Real-time detection tasks
- Normalized coordinate format

**Class Names File (classes.txt):**
```
car
person
bicycle
dog
cat
```

### 4. CSV Format
**Best for:** Classification, tagging, metadata
**File extension:** `.csv`

```csv
file_path,class,confidence,label,user,notes
images/img1.jpg,dog,0.95,high_quality,john_doe,Clear image
images/img2.jpg,cat,0.87,medium_quality,jane_smith,Slight blur
images/img3.jpg,bird,0.92,high_quality,john_doe,Good lighting
```

**Supported Fields:**
- `file_path` / `filename` - Path to the file
- `class` / `label` - Classification label
- `confidence` - Annotation confidence score
- Custom fields (automatically preserved)

### 5. JSON Format
**Best for:** Custom flexible format
**File extension:** `.json`

```json
[
  {
    "id": "1",
    "file_name": "image1.jpg",
    "annotations": [
      {
        "class": "car",
        "confidence": 0.95,
        "bbox": [100, 100, 200, 150]
      }
    ],
    "metadata": {
      "annotator": "john_doe",
      "timestamp": "2024-05-03T10:00:00Z"
    }
  }
]
```

## S3 Configuration

### AWS S3 Setup

1. **Create AWS S3 Bucket:**
```bash
aws s3 mb s3://annotateme-data --region us-east-1
```

2. **Create IAM User with S3 permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::annotateme-data/*",
        "arn:aws:s3:::annotateme-data"
      ]
    }
  ]
}
```

3. **Configure Environment Variables:**
```bash
# .env file
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
AWS_S3_BUCKET=annotateme-data
```

### Alternative: MinIO (Local S3-Compatible)

For local development without AWS:

```bash
# Start MinIO container
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

**Environment Configuration:**
```bash
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
AWS_S3_BUCKET=annotateme-data
AWS_ENDPOINT=http://localhost:9000
AWS_FORCE_PATH_STYLE=true
```

## API Endpoints

### Upload Files
```
POST /api/import-export/:projectId/upload
Content-Type: multipart/form-data

Files: [file1.jpg, file2.jpg, ...]
```

**Response:**
```json
{
  "message": "Files uploaded successfully",
  "count": 2,
  "files": [
    {
      "id": "uuid",
      "originalName": "file1.jpg",
      "fileName": "s3-key-path",
      "size": 1024000,
      "status": "completed"
    }
  ]
}
```

### Import Annotations
```
POST /api/import-export/:projectId/import?format=coco
Content-Type: multipart/form-data

file: annotations.json
classNames: ["car", "person", "bicycle"]  # Optional for YOLO
labelField: "label"  # Optional for CSV
```

**Supported Formats:** `coco`, `pascal_voc`, `yolo`, `csv`, `json`

**Response:**
```json
{
  "message": "Annotations imported successfully",
  "format": "coco",
  "count": 45,
  "annotations": [...]
}
```

### Export Annotations
```
GET /api/import-export/:projectId/export?format=coco
```

**Query Parameters:**
- `format`: `coco` | `pascal_voc` | `yolo` | `csv` | `json` (default: coco)

**Response:**
```json
{
  "message": "Annotations exported successfully",
  "format": "coco",
  "filename": "project-name-coco.json",
  "s3Key": "projects/uuid/annotations/...",
  "downloadUrl": "https://signed-url...",
  "count": 45
}
```

### Get File Download URL
```
GET /api/import-export/file/:fileId/download
```

**Response:**
```json
{
  "filename": "image1.jpg",
  "downloadUrl": "https://signed-url...",
  "size": 1024000
}
```

### Get Presigned Upload URL
```
POST /api/import-export/:projectId/get-upload-url
Content-Type: application/json

{
  "filename": "image1.jpg"
}
```

**Response:**
```json
{
  "uploadUrl": "https://signed-upload-url...",
  "expiresIn": 3600
}
```

### List Project Files
```
GET /api/import-export/:projectId/files
```

**Response:**
```json
{
  "count": 10,
  "files": [
    {
      "id": "uuid",
      "originalName": "image1.jpg",
      "fileName": "s3-key",
      "mimeType": "image/jpeg",
      "size": 1024000,
      "status": "completed",
      "uploadedAt": "2024-05-03T10:00:00Z"
    }
  ]
}
```

### Delete File
```
DELETE /api/import-export/:projectId/files/:fileId
```

## Format Conversion Examples

### COCO to YOLO
```typescript
const yoloData = FormatConverter.unifiedToYOLO(unifiedAnnotations);
// Output: { annotations: [...], classNames: [...] }
```

### Pascal VOC to COCO
```typescript
const cocoData = FormatConverter.unifiedToCOCO(unifiedAnnotations, "project-name");
// Creates standard COCO JSON format
```

### CSV to Unified
```typescript
const unified = FormatConverter.csvToUnified(csvData, "label_field");
// Converts tabular data to unified annotation format
```

## Storage Directory Structure

S3 storage is organized as:
```
annotateme-data/
├── projects/
│   ├── {projectId}/
│   │   ├── files/
│   │   │   ├── {timestamp}-{filename}
│   │   │   └── ...
│   │   └── annotations/
│   │       ├── {timestamp}-{filename}
│   │       └── ...
```

## Best Practices

### 1. File Organization
- Use consistent naming conventions
- Organize files by project ID
- Include timestamps for versioning

### 2. Format Selection
| Use Case | Format | Reason |
|----------|--------|--------|
| Object Detection | COCO | Industry standard, rich metadata |
| Real-time Detection | YOLO | Normalized coordinates, lightweight |
| Classification | CSV | Simple, spreadsheet-friendly |
| Legacy VOC Data | Pascal VOC | Compatibility with existing tools |
| Custom Schemas | JSON | Maximum flexibility |

### 3. Performance
- Use signed URLs for direct browser uploads
- Implement multipart uploads for large files
- Batch export/import operations
- Set appropriate S3 lifecycle policies

### 4. Security
- Enable S3 bucket versioning
- Use IAM roles instead of access keys
- Implement bucket encryption
- Set appropriate CORS policies
- Use signed URLs with expiration

## Troubleshooting

### S3 Connection Issues
```bash
# Test AWS credentials
aws s3 ls s3://annotateme-data/

# Verify bucket access
aws s3api head-bucket --bucket annotateme-data
```

### Import Failures
1. Verify JSON format validity
2. Check file encoding (UTF-8)
3. Validate category/class names
4. Ensure coordinates are in expected range

### Large File Uploads
- Use multipart upload API
- Increase `bodyParser` limit in Express
- Consider direct S3 uploads via presigned URLs

## Advanced Configuration

### Custom S3-Compatible Storage
```env
AWS_ENDPOINT=https://storage.googleapis.com  # Google Cloud Storage
AWS_ENDPOINT=https://s3-accelerate.amazonaws.com  # S3 accelerated
AWS_ENDPOINT=https://spaces.digitaloceanspaces.com  # DigitalOcean Spaces
```

### Bucket Lifecycle Policy
```json
{
  "Rules": [
    {
      "Id": "DeleteOldExports",
      "Status": "Enabled",
      "Prefix": "projects/*/annotations/",
      "Expiration": {
        "Days": 30
      }
    }
  ]
}
```

---

**Last Updated:** May 3, 2026
**S3 SDK Version:** AWS SDK v3
**Supported Formats:** COCO, Pascal VOC, YOLO, CSV, JSON
