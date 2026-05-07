# Dynamic Label Creation Guide

## Overview

AnnotateMe now supports automatic label extraction and creation from imported annotation files. Labels are automatically extracted from all supported dataset formats without manual entry.

## Features

✅ **Automatic Label Extraction**
- Extract labels from uploaded annotation files
- Preview before creating
- Support for 15+ dataset formats
- Automatic color assignment

✅ **Batch Creation**
- Create multiple labels in one operation
- Deduplication support
- Merge duplicate labels
- Track label source (auto-extracted vs user-created)

✅ **Manual Label Management**
- Create labels from text list
- Edit label properties (name, color, category)
- Delete labels
- View label statistics

✅ **Smart Label Detection**
- Format-specific label parsing
- Category assignment
- Metadata tracking
- Usage counting

## Supported Label Sources

### Format-Specific Extraction

| Format | Label Source | How It Extracts |
|--------|--------------|-----------------|
| **COCO** | `categories` array | Reads `name` from each category |
| **Pascal VOC** | `objects[].name` | Extracts object names |
| **YOLO** | `classNames` parameter | Uses provided class names |
| **KITTI** | `objects[].type` | Reads object type (e.g., Car, Pedestrian) |
| **COCO Panoptic** | `categories` array | Reads category names with `isthing` flag |
| **CVAT** | `shapes.label` / `tracks.label` | Extracts from shape/track labels |
| **CSV** | Custom field | Reads from specified column (default: "label") |
| **Keypoint** | `keypoints[].name` | Reads keypoint names |
| **Point Cloud** | `objects[].type` | Reads object types |
| **Video Frame** | `annotations[].label` | Reads track/object labels |
| **Weak Supervision** | Multiple sources | Image labels, scribbles, clicks |
| **JSON** | Various fields | Searches `class`, `label`, `type`, `category`, `name` |

## API Endpoints

### Extract Labels (Preview Only)
```bash
POST /api/labels/:projectId/extract-labels
Content-Type: multipart/form-data

file: annotation_file.json
format: coco
```

**Response:**
```json
{
  "message": "Labels extracted successfully",
  "format": "coco",
  "count": 5,
  "extracted_labels": [
    {
      "name": "car",
      "color": "#FF6B6B",
      "count": 0,
      "category": "vehicle",
      "metadata": { "category_id": 1, "source_format": "coco" }
    }
  ],
  "preview": [...]
}
```

### Auto-Create Labels
```bash
POST /api/labels/:projectId/auto-create-labels
Content-Type: multipart/form-data

file: annotation_file.json
format: coco
```

**Response:**
```json
{
  "message": "Labels created automatically",
  "format": "coco",
  "created_count": 5,
  "labels": [
    {
      "id": "uuid",
      "name": "car",
      "color": "#FF6B6B",
      "source": "auto_extracted",
      "category": "vehicle"
    }
  ]
}
```

### Create Labels from List
```bash
POST /api/labels/:projectId/create-labels-from-list
Content-Type: application/json

{
  "labels": ["dog", "cat", "person", "bicycle"],
  "auto_assign_colors": true
}
```

**Response:**
```json
{
  "message": "Labels created successfully",
  "created_count": 4,
  "labels": [...]
}
```

### Get Project Labels
```bash
GET /api/labels/:projectId
```

**Response:**
```json
{
  "count": 5,
  "labels": [
    {
      "id": "uuid",
      "name": "car",
      "description": "car",
      "color": "#FF6B6B",
      "source": "auto_extracted",
      "category": "vehicle",
      "usage_count": 42,
      "metadata": {...}
    }
  ]
}
```

### Get Label Statistics
```bash
GET /api/labels/:projectId/stats
```

**Response:**
```json
{
  "total_labels": 10,
  "auto_extracted": 7,
  "user_created": 3,
  "by_category": {
    "vehicle": 4,
    "person": 3,
    "general": 3
  },
  "labels": [...]
}
```

### Merge Duplicate Labels
```bash
POST /api/labels/:projectId/merge-duplicates
```

**Response:**
```json
{
  "message": "Merged 2 duplicate labels",
  "merged_count": 2
}
```

### Create Single Label
```bash
POST /api/labels/:projectId/create
Content-Type: application/json

{
  "name": "person",
  "description": "People in images",
  "color": "#4ECDC4",
  "category": "human"
}
```

### Update Label
```bash
PATCH /api/labels/:projectId/labels/:labelId
Content-Type: application/json

{
  "name": "person_updated",
  "color": "#4ECDC4",
  "category": "human"
}
```

### Delete Label
```bash
DELETE /api/labels/:projectId/labels/:labelId
```

### Bulk Import Labels
```bash
POST /api/labels/:projectId/bulk-import-labels?format=coco&merge_duplicates=true
Content-Type: multipart/form-data

file: annotations.json
```

## Usage Workflows

### Workflow 1: Auto-Create from COCO File

```typescript
// Frontend
import { LabelService } from 'services/label.service';

constructor(private labelService: LabelService) {}

importCOCOAnnotations(file: File, projectId: string) {
  this.labelService.autoCreateLabels(projectId, [], 'coco')
    .subscribe(response => {
      console.log(`Created ${response.created_count} labels`);
    });
}
```

### Workflow 2: Preview Before Creating

```typescript
// Extract labels for preview
this.labelService.extractLabels(projectId, file, 'kitti')
  .subscribe(response => {
    // Show user the extracted labels
    const preview = response.extracted_labels;
    
    // User confirms, then create
    this.labelService.autoCreateLabels(projectId, preview, 'kitti')
      .subscribe(result => {
        console.log(`Created ${result.created_count} labels`);
      });
  });
```

### Workflow 3: Manual List Creation

```typescript
// Create from text list
const labels = ['cat', 'dog', 'bird'];
this.labelService.createLabelsFromList(projectId, labels)
  .subscribe(response => {
    console.log(`Created ${response.created_count} labels`);
  });
```

### Workflow 4: Bulk Import with Deduplication

```typescript
// Import from file with automatic deduplication
this.labelService.bulkImportLabels(projectId, file, 'coco', true)
  .subscribe(response => {
    console.log(`Created: ${response.created_count}, Merged: ${response.merged_count}`);
  });
```

## Label Database Schema

```sql
CREATE TABLE labels (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7),
  source ENUM ('standard', 'auto_extracted', 'user_created'),
  category VARCHAR(100),
  usageCount INTEGER DEFAULT 0,
  metadata JSON,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  projectId UUID FOREIGN KEY
);

CREATE INDEX idx_labels_project ON labels(projectId);
CREATE INDEX idx_labels_name ON labels(name);
CREATE INDEX idx_labels_source ON labels(source);
```

## Label Properties

### Name
- Unique within project
- Max 255 characters
- Can contain spaces and special characters
- Case-sensitive

### Color
- Hex color code (e.g., #FF6B6B)
- Auto-assigned if not provided
- Supports 15+ predefined colors
- User-customizable

### Source
- `standard` - Predefined labels
- `auto_extracted` - Extracted from imports
- `user_created` - Manually created

### Category
- Optional label grouping
- Auto-assigned based on format:
  - COCO: `supercategory`
  - KITTI: `3d_object`
  - Panoptic: `thing` or `stuff`
  - Video: `video_object`
  - Keypoint: `keypoint`

### Metadata
- Format-specific information
- Category IDs, field names
- 3D flags, tracking support
- Source format tracking

## Auto-Color Assignment

AnnotateMe provides 15 predefined colors:
```
#FF6B6B  - Coral Red
#4ECDC4  - Turquoise
#45B7D1  - Sky Blue
#FFA07A  - Light Salmon
#98D8C8  - Mint
#F7DC6F  - Yellow
#BB8FCE  - Purple
#85C1E2  - Light Blue
#F8B88B  - Peach
#A3E4D7  - Aquamint
#FFB6C1  - Pink
#DDA15E  - Tan
#BC6C25  - Brown
#6A994E  - Green
#BC4749  - Brick Red
```

Colors are assigned randomly; users can customize anytime.

## Usage Statistics

The system tracks:
- Total labels in project
- Auto-extracted vs user-created ratio
- Labels by category
- Label usage count (annotations per label)
- Label source tracking

Access via: `GET /api/labels/:projectId/stats`

## Best Practices

### 1. Validate Before Creating
```typescript
// Extract first
this.labelService.extractLabels(projectId, file, format)
  .subscribe(extracted => {
    // Review labels
    if (extracted.count > 0) {
      // Create
      this.labelService.autoCreateLabels(projectId, extracted.extracted_labels, format)
        .subscribe(result => {
          // Handle success
        });
    }
  });
```

### 2. Deduplicate Regularly
```typescript
// After bulk imports
this.labelService.mergeDuplicates(projectId)
  .subscribe(result => {
    console.log(`Cleaned up ${result.merged_count} duplicates`);
  });
```

### 3. Monitor Label Statistics
```typescript
// Track label health
this.labelService.getLabelStats(projectId)
  .subscribe(stats => {
    console.log(`${stats.total_labels} labels, ${stats.auto_extracted} auto-extracted`);
  });
```

### 4. Use Consistent Naming
- Lowercase with underscores: `person_bicycle`
- No special characters except underscore
- Descriptive names: `traffic_light_red` vs `light`

## Limitations

- Label name must be unique per project
- Max 1000 labels per project (soft limit)
- Bulk operations timeout after 30 seconds
- Label name max length: 255 characters

## Example: Complete Annotation Import with Auto-Labels

```typescript
// 1. Import file
importAnnotationsWithLabels(file: File, projectId: string) {
  // Extract labels
  this.labelService.extractLabels(projectId, file, 'coco')
    .subscribe(extracted => {
      // Show preview to user
      this.previewLabels(extracted.extracted_labels);
    });
}

// 2. User confirms
confirmAndCreateLabels(labels: any[], projectId: string) {
  // Create labels
  this.labelService.autoCreateLabels(projectId, labels, 'coco')
    .subscribe(created => {
      // Get updated stats
      this.labelService.getLabelStats(projectId)
        .subscribe(stats => {
          console.log(`Created ${created.created_count} labels. Total: ${stats.total_labels}`);
          // Now proceed with importing annotations
          this.importAnnotations(file, projectId);
        });
    });
}

// 3. Import annotations (labels already exist)
importAnnotations(file: File, projectId: string) {
  this.importExportService.importAnnotations(projectId, file, 'coco')
    .subscribe(result => {
      console.log(`Imported ${result.count} annotations`);
    });
}
```

## FAQ

**Q: Will existing labels be overwritten when I import?**
A: No. The system checks for existing labels by name and skips duplicates.

**Q: Can I change a label's color?**
A: Yes, use the PATCH endpoint to update any label property.

**Q: How are labels deduplicated?**
A: By case-insensitive name matching after trimming whitespace.

**Q: Can I import labels without annotations?**
A: Yes, use the extract and auto-create endpoints independently.

**Q: What happens if a format has no labels?**
A: The system returns an empty array and no labels are created.

---

**Last Updated:** May 3, 2026
**Label Formats:** 15+
**Auto-Colors:** 15
