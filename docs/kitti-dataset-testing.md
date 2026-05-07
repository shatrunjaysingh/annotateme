# Testing with the Synthetic KITTI Dataset

This guide walks through importing and annotating the synthetic KITTI Autonomous Driving dataset in AnnotateMe.

## What's in the dataset

10 synthetic road scene images (1242×375, standard KITTI resolution) with ground-truth annotations:

| Class | Description |
|-------|-------------|
| Car | Passenger vehicles at various depths |
| Truck | Large vehicles with cargo box |
| Pedestrian | Human silhouettes near road edges |

Each scene has 2–7 objects with proper KITTI label files covering truncation, occlusion, 2D bounding boxes, 3D dimensions, and rotation.

---

## Prerequisites

- AnnotateMe frontend running at `http://localhost:4200`
- AnnotateMe backend running at `http://localhost:3000`
- Dataset zip at `~/Desktop/kitti_dataset.zip` (or regenerate — see below)
- A tenant created in Admin → Tenants tab (see Step 0)

---

## Step 0 — Set up a tenant

All projects, tasks, and jobs belong to a tenant (organization). Exports are stored in tenant-scoped folders.

1. Log in as an **admin** user.
2. Click **Admin** in the navbar → **Tenants** tab.
3. Click **+ New Tenant** and enter a name (e.g. `Autonomous Driving Team`).
4. Click the tenant row to expand it → **Add user** to assign annotators to this tenant.
5. Select the new tenant from the **tenant switcher** dropdown next to the AnnotateMe logo in the navbar.

> Non-admin users will only see projects, tasks, and jobs belonging to their assigned tenants. The tenant switcher filters all list views automatically.

---

## Step 1 — Regenerate the dataset (if needed)

```bash
python3.10 /tmp/generate_kitti.py
```

Output is written to `/tmp/kitti_dataset/` with two subdirectories:
- `image_2/` — 10 PNG files named `000000.png` … `000009.png`
- `label_2/` — 10 KITTI label files named `000000.txt` … `000009.txt`

---

## Step 2 — Create a project

1. Open `http://localhost:4200` and log in.
2. Select the correct tenant from the **tenant switcher** in the navbar (next to the AnnotateMe logo). The project will be scoped to whichever tenant is active.
3. Click **Projects** in the navbar.
4. Click the **+** button (top-right toolbar).
5. Fill in the form:
   - **Project Name**: `KITTI Autonomous Driving`
   - **Description**: `Synthetic road scene dataset for annotation testing`
   - **Data Type**: `image`
   - **Labels**: `Car, Truck, Pedestrian`
6. Click **Create**.

---

## Step 3 — Add labels with types (optional but recommended)

On the Project Detail page, scroll to the **Label Constructor** section and add each label with the correct shape type:

| Label | Type | Suggested attributes |
|-------|------|----------------------|
| Car | Rectangle | `occluded` (checkbox), `truncated` (checkbox) |
| Truck | Rectangle | `occluded` (checkbox) |
| Pedestrian | Rectangle | `occluded` (checkbox), `activity` (select: standing, walking, running) |

To add a label with attributes:
1. Click **Add label ⊕** in the Constructor tab.
2. Enter the name, select **Rectangle** as the type, and pick a color.
3. Click **+ Add attribute** for each attribute row.
4. Click **Add** to save.

---

## Step 4 — Create a task and upload images

1. On the Project Detail page, click the **+** button in the Tasks toolbar.
2. Fill in:
   - **Task Name**: `Road Scenes — Train Set`
   - **Subset**: `Train`
3. Click **Create**.
4. On the task card that appears, click **Upload**.
5. Select all 10 PNG files from `/tmp/kitti_dataset/image_2/` (`000000.png` … `000009.png`).

---

## Step 5 — Import KITTI ground-truth annotations

After upload completes, use the task **⋮ menu → Import dataset** to import the KITTI labels:

1. Click **⋮** on the task card.
2. Click **Import dataset**.
3. Select a JSON file — you need to convert the KITTI labels first (see below), or use the API directly.

### Convert KITTI labels to AnnotateMe JSON format

Run this one-liner to convert the label files:

```bash
python3.10 - <<'EOF'
import os, json

label_dir = "/tmp/kitti_dataset/label_2"
output = {"annotations": []}

for fname in sorted(os.listdir(label_dir)):
    if not fname.endswith(".txt"):
        continue
    frame_id = int(fname.replace(".txt", ""))
    shapes = []
    with open(os.path.join(label_dir, fname)) as f:
        for line in f:
            parts = line.strip().split()
            if not parts:
                continue
            label = parts[0]
            x1, y1, x2, y2 = float(parts[4]), float(parts[5]), float(parts[6]), float(parts[7])
            shapes.append({
                "type": "rectangle",
                "label": label,
                "points": [x1, y1, x2, y2],
                "attributes": {
                    "truncated": parts[1],
                    "occluded": parts[2]
                }
            })
    output["annotations"].append({"frame": frame_id, "shapes": shapes})

out_path = "/tmp/kitti_annotations.json"
with open(out_path, "w") as f:
    json.dump(output, f, indent=2)
print(f"Written to {out_path}  ({len(output['annotations'])} frames)")
EOF
```

Then import `/tmp/kitti_annotations.json` via **Import dataset** on the task card.

---

## Step 6 — Create annotation jobs

1. On the task card, click **+** in the jobs toolbar (expand the task first).
2. Configure the job:
   - **Job type**: `Regular`
   - **Frame selection**: `Manual`
   - **Frame count**: `10`
3. Click **Create**.
4. Optionally assign the job to a user via the **Assignee** dropdown.

---

## Step 7 — Annotate

1. Click **Open** on the job row, or click the job link.
2. The annotation editor opens. You should see the road scene images.
3. Select the **Rectangle** tool from the left toolbar.
4. Draw bounding boxes around cars, trucks, and pedestrians.
5. Assign a label from the label panel on the right.
6. Navigate between frames using the arrow keys or the frame scrubber.
7. When done, use the menu (top-right **⋮**) → **Finish the job** to mark it complete.

---

## Step 8 — Verify and export

### Check annotation coverage

- The frame progress bar on the task card should fill as you annotate frames.
- Job state should move from `new` → `in_progress` → `completed`.

### Export annotations

Exports are stored in **tenant-scoped folders** so different teams' outputs never mix.

| Storage mode | Export path |
|---|---|
| Local filesystem | `exports/<tenantId>/<projectId>/<timestamp>-<filename>` |
| S3 / MinIO | `tenants/<tenantId>/projects/<projectId>/annotations/<timestamp>-<filename>` |

Projects with no tenant assigned fall back to `exports/<projectId>/...`.

**From the job card:**
```
Job ⋮ menu → Export annotations
```
Downloads `job-<id>-annotations.json` directly to your browser.

**From the project card (Projects page):**
```
Project ⋮ menu → Export dataset
```
Saves the full project export to the tenant folder and returns a signed download URL.

**Via API:**
```bash
# Direct download (streams file to disk)
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/import-export/<projectId>/export?format=coco&download=true" \
  -o kitti_coco.json

# Save to storage and get download URL
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/import-export/<projectId>/export?format=coco" | jq .downloadUrl
```

Supported formats: `coco`, `pascal_voc`, `yolo`, `csv`, `json`.

---

## Expected ground truth per scene

| Frame | Objects |
|-------|---------|
| 000000 | 3× Car, 1× Truck |
| 000001 | 2× Car |
| 000002 | 4× Car |
| 000003 | 2× Car |
| 000004 | 3× Car |
| 000005 | 2× Car |
| 000006 | 4× Car |
| 000007 | 4× Car |
| 000008 | 2× Car |
| 000009 | 2× Car |

> Objects near image edges may be truncated (truncated=0.5 in the label file).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Images don't appear after upload | Check that MinIO/S3 is running and the `MINIO_*` env vars are set in `packages/backend/.env` |
| Import fails | Ensure the JSON matches the expected format (frame index, shapes array with type/label/points) |
| No labels in dropdown | Add labels in the Label Constructor on the Project Detail page before opening the editor |
| Job stuck at `new` | Open the job in the editor and make at least one annotation to trigger `in_progress` state |
| Tenant dropdown only shows "All tenants" | Go to Admin → Tenants tab; loading that tab syncs the global tenant list. On next refresh the Navbar fetches it automatically. |
| Projects not filtering by tenant | Make sure the correct tenant is selected in the navbar switcher before navigating to Projects/Tasks/Jobs |
| Export saved to wrong folder | The export folder is determined by the project's assigned tenant at export time. Re-create the project under the correct tenant if needed. |
