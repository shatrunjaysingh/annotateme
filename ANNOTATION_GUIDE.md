# Annotation Guide

## Getting Started

1. Log in and open a **Project**
2. Open a **Task** inside the project
3. Click **Start Job** (or open an existing job) — this opens the Annotation Editor

---

## 2D Image Annotation

### Supported file types
JPEG, PNG, GIF, BMP, WebP

### Tools (keyboard shortcuts)

| Key | Tool | Use for |
|-----|------|---------|
| S | Select | Click to select/move an existing shape |
| R | Rectangle | Bounding boxes |
| P | Polygon | Irregular shapes (click each vertex, double-click to close) |
| L | Polyline | Lines, roads, lane markings |
| D | Point | Key points, landmarks |
| E | Ellipse | Round objects |

### Step-by-step

1. **Pick a label** from the right panel — the active label is shown as a colour swatch in the left toolbar
2. **Pick a tool** (keyboard shortcut or left toolbar button)
3. **Draw on the image**:
   - Rectangle / Ellipse: click and drag
   - Polygon / Polyline: click each vertex, double-click the last point to finish
   - Point: single click
4. **Adjust** with the Select tool — drag the shape or drag individual vertices
5. **Change label**: select a shape, then click a different label in the right panel
6. **Delete**: select a shape and press Delete / Backspace
7. **Undo / Redo**: Ctrl+Z / Ctrl+Y

### Navigation
- **← →** arrow keys — previous / next frame
- **Ctrl+S** — save now (also auto-saves every 3 seconds)
- Mouse wheel — zoom in/out on the canvas
- Middle-click drag (or right-click drag) — pan

### Filters & appearance
The right panel **Appearance** section lets you change fill opacity, border style, and colour-by mode (by label or by instance).

---

## 3D Point Cloud Annotation

### Supported file type
`.pcd` (ASCII, binary, binary_compressed with LZF)

### Views
The 3D editor shows four viewports:

| Viewport | Description |
|----------|-------------|
| **Perspective** (main, top-left area) | Free-orbit 3D view |
| **Top** (bottom-left) | Bird's-eye / XZ plane |
| **Side** (bottom-centre) | Side view / XY plane |
| **Front** (bottom-right) | Front view / YZ plane |

Click **⤢** on any sub-view to expand it full-screen. Click **✕ Collapse** to return.

### Tools

| Button | Action |
|--------|--------|
| Select (S) | Click a cuboid to select it |
| Cuboid | Draw a 3D bounding box |

### Step-by-step

1. **Switch to 3D mode** — click **Standard 3D** in the top toolbar. The point cloud loads automatically.
2. **Pick a label** from the right panel
3. **Select the Cuboid tool** from the left toolbar
4. **Draw in a sub-view** (Top, Side, or Front) — click and drag to set the footprint. The cuboid appears in all views simultaneously.
5. **Nudge into position** using the keyboard (cuboid is auto-selected after drawing):

| Key | Movement | Key | Movement |
|-----|----------|-----|----------|
| U | Up | J | Down |
| I | Forward | K | Backward |
| O | Right | L | Left |

Hold **Shift** for a 5× larger step (0.5 m instead of 0.1 m).

6. **Click a cuboid** in the perspective view to re-select it
7. **Ctrl+S** to save (also auto-saves every 3 seconds)

### Tips
- Scroll to zoom in sub-views; click-drag to pan them
- Orbit the perspective view by dragging; zoom with scroll
- Invalid LiDAR returns (NaN points) are automatically filtered out
- Arrow keys still navigate between frames in 3D mode

---

## Video Files

Video files (MP4, AVI, MOV, MKV, WebM) **can be uploaded** to a task, but **frame-by-frame annotation is not yet supported** — the annotation canvas is image-only. To annotate video, extract frames as individual images first (e.g. with `ffmpeg`) and upload the image sequence instead.

```bash
# Extract one frame per second as JPEG
ffmpeg -i your_video.mp4 -vf fps=1 frame_%04d.jpg
```

---

## Keyboard Reference

| Shortcut | Action |
|----------|--------|
| S / R / P / L / D / E | Switch 2D tool (Select / Rect / Polygon / Polyline / Point / Ellipse) |
| U I O / J K L | Nudge selected 3D cuboid (+ Shift for ×5 step) |
| ← / → | Previous / next frame |
| Ctrl+S | Save annotations |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Delete / Backspace | Delete selected shape |
| Escape | Close menus |
