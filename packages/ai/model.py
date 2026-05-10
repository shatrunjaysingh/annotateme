"""
model.py — AnnotateMe AI inference models.

Quick start
-----------
The default active_model is ProductionModel which uses YOLOv8n-seg.
It downloads ~11 MB of weights on first run and works immediately on
80 COCO classes (person, car, dog, …).

To use YOUR OWN fine-tuned weights (see train.py):
    active_model = ProductionModel(weights="runs/segment/train/weights/best.pt")

To restrict which labels get returned:
    active_model = ProductionModel(label_filter={"car", "person", "truck"})

Output modes
------------
  "both"    → each detection emits a rect + a polygon  (default)
  "segment" → polygon contours only
  "detect"  → bounding boxes only (faster, no mask head)

Prediction schema
-----------------
  type        : "rect" | "polygon"
  label       : str
  confidence  : float  (0 – 1)
  points      : list of {"x": float, "y": float} in IMAGE pixel coords
    rect    → 2 points [top-left, bottom-right]
    polygon → 3+ contour points (pre-simplified with RDP)
"""

from __future__ import annotations

import math
import random
from abc import ABC, abstractmethod
from typing import Literal

import numpy as np
from PIL import Image


# ─────────────────────────── shared types ───────────────────────────────────

Point = dict  # {"x": float, "y": float}

class Prediction(dict):
    """type, label, confidence, points — typed as a plain dict for JSON compat."""


# ─────────────────────────── base interface ─────────────────────────────────

class BaseAnnotationModel(ABC):
    @abstractmethod
    def predict(self, image: Image.Image) -> list[Prediction]:
        """Run inference and return a list of Prediction dicts."""
        ...


# ─────────────────────────── geometry utils ─────────────────────────────────

def _rdp_simplify(points: np.ndarray, epsilon: float) -> np.ndarray:
    """
    Ramer–Douglas–Peucker polygon simplification.
    Reduces vertex count while preserving shape fidelity.
    epsilon: max perpendicular distance to drop a point (pixels).
    """
    if len(points) <= 2:
        return points

    # Find the point furthest from the line start→end
    start, end = points[0], points[-1]
    d = end - start
    norm = math.hypot(d[0], d[1])
    if norm == 0:
        dists = np.linalg.norm(points - start, axis=1)
    else:
        # Perpendicular distance from each point to the line
        dists = np.abs(d[1] * points[:, 0] - d[0] * points[:, 1]
                       + end[0] * start[1] - end[1] * start[0]) / norm

    idx = int(np.argmax(dists))
    max_dist = dists[idx]

    if max_dist > epsilon:
        left  = _rdp_simplify(points[:idx + 1], epsilon)
        right = _rdp_simplify(points[idx:], epsilon)
        return np.vstack([left[:-1], right])
    else:
        return np.array([start, end])


def _mask_to_polygon(xy: np.ndarray, epsilon: float = 2.0,
                     min_points: int = 6) -> list[Point]:
    """
    Convert YOLOv8 mask contour (N×2 float array) to a simplified
    list of {"x", "y"} points.
    """
    if len(xy) < 3:
        return []
    pts = _rdp_simplify(xy, epsilon)
    if len(pts) < min_points:
        # Adaptive: loosen epsilon until we have enough points
        for eps in (epsilon / 2, epsilon / 4, 0):
            pts = _rdp_simplify(xy, eps) if eps > 0 else xy
            if len(pts) >= min_points:
                break
    return [{"x": float(p[0]), "y": float(p[1])} for p in pts]


# ─────────────────────────── mock model ─────────────────────────────────────

class MockModel(BaseAnnotationModel):
    """Returns random detections — no ML deps required.  Useful for testing."""

    LABELS = ["car", "person", "bicycle", "truck", "dog", "cat", "bus"]

    def predict(self, image: Image.Image) -> list[Prediction]:
        w, h = image.size
        out: list[Prediction] = []
        for _ in range(random.randint(1, 4)):
            label = random.choice(self.LABELS)
            x1 = random.uniform(0.05, 0.4) * w
            y1 = random.uniform(0.05, 0.4) * h
            x2 = min(x1 + random.uniform(0.1, 0.4) * w, w - 1)
            y2 = min(y1 + random.uniform(0.1, 0.4) * h, h - 1)
            conf = round(random.uniform(0.55, 0.99), 3)
            out.append({"type": "rect",    "label": label, "confidence": conf,
                        "points": [{"x": x1, "y": y1}, {"x": x2, "y": y2}]})
            # Approximate polygon from the same box
            out.append({"type": "polygon", "label": label, "confidence": conf,
                        "points": [{"x": x1, "y": y1}, {"x": (x1+x2)/2, "y": y1},
                                   {"x": x2, "y": y1}, {"x": x2, "y": (y1+y2)/2},
                                   {"x": x2, "y": y2}, {"x": (x1+x2)/2, "y": y2},
                                   {"x": x1, "y": y2}, {"x": x1, "y": (y1+y2)/2}]})
        return out


# ─────────────────────────── production model ───────────────────────────────

class ProductionModel(BaseAnnotationModel):
    """
    YOLOv8 segmentation model — detects objects AND traces polygon contours.

    Parameters
    ----------
    weights : str
        Path to a .pt weights file, or a model identifier that Ultralytics will
        download automatically.
        Pre-trained options (auto-download, no GPU required for inference):
          "yolov8n-seg.pt"   ~11 MB  fastest  (default)
          "yolov8s-seg.pt"   ~24 MB  balanced
          "yolov8m-seg.pt"   ~52 MB  accurate
          "yolov8l-seg.pt"   ~88 MB  very accurate
          "yolov8x-seg.pt"  ~136 MB  most accurate
        For detection-only (no polygons) use the non-seg variants:
          "yolov8n.pt", "yolov8s.pt", …
        For your custom fine-tuned model (see train.py):
          "runs/segment/train/weights/best.pt"

    mode : "both" | "segment" | "detect"
        "both"    → each detected object produces one rect + one polygon
        "segment" → polygon contours only (requires a -seg model)
        "detect"  → bounding boxes only

    conf : float
        Minimum confidence to keep a prediction (0–1, default 0.35).

    iou : float
        IoU threshold for non-maximum suppression (default 0.45).

    max_det : int
        Maximum number of detections per image (default 100).

    rdp_epsilon : float
        Ramer–Douglas–Peucker simplification tolerance in pixels.
        Higher = fewer polygon points, less precise (default 2.0).

    label_filter : set[str] | None
        If provided, only return predictions whose label is in this set.
        Labels must match COCO names or your custom training labels.
        Example: {"car", "person", "truck"}

    device : str | None
        Inference device: "cpu", "cuda", "mps" (Apple Silicon), or None
        to let Ultralytics auto-select.
    """

    # All 80 COCO class names in class-index order
    COCO_CLASSES: list[str] = [
        "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
        "truck", "boat", "traffic light", "fire hydrant", "stop sign",
        "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep",
        "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
        "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard",
        "sports ball", "kite", "baseball bat", "baseball glove", "skateboard",
        "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork",
        "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
        "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
        "couch", "potted plant", "bed", "dining table", "toilet", "tv",
        "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave",
        "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase",
        "scissors", "teddy bear", "hair drier", "toothbrush",
    ]

    def __init__(
        self,
        weights: str = "yolov8n-seg.pt",
        mode: Literal["both", "segment", "detect"] = "both",
        conf: float = 0.15,
        iou: float = 0.45,
        max_det: int = 100,
        rdp_epsilon: float = 2.0,
        label_filter: set[str] | None = None,
        device: str | None = None,
    ) -> None:
        try:
            from ultralytics import YOLO  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "ultralytics is not installed.\n"
                "Uncomment it in packages/ai/requirements.txt and run:\n"
                "  pip install ultralytics"
            ) from exc

        self._model = YOLO(weights)
        self._mode = mode
        self._conf = conf
        self._iou = iou
        self._max_det = max_det
        self._epsilon = rdp_epsilon
        self._filter = label_filter
        self._device = device
        self._seg = "-seg" in weights or (
            hasattr(self._model, "task") and self._model.task == "segment"
        )

    # ── inference ─────────────────────────────────────────────────────────

    def predict(self, image: Image.Image) -> list[Prediction]:
        results = self._model.predict(
            source=image,
            conf=self._conf,
            iou=self._iou,
            max_det=self._max_det,
            device=self._device,
            verbose=False,
        )
        result = results[0]
        names: dict[int, str] = result.names
        out: list[Prediction] = []

        boxes = result.boxes
        masks = result.masks  # None if detection-only model

        for i, box in enumerate(boxes):
            label = names[int(box.cls[0])]
            if self._filter and label not in self._filter:
                continue

            conf = round(float(box.conf[0]), 4)
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])

            # ── bounding box ──────────────────────────────────────────────
            if self._mode in ("both", "detect"):
                out.append({
                    "type": "rect",
                    "label": label,
                    "confidence": conf,
                    "points": [{"x": x1, "y": y1}, {"x": x2, "y": y2}],
                })

            # ── polygon contour ───────────────────────────────────────────
            if self._mode in ("both", "segment") and self._seg and masks is not None:
                try:
                    xy: np.ndarray = masks.xy[i]  # (N, 2) float32
                    pts = _mask_to_polygon(xy, epsilon=self._epsilon)
                    if pts:
                        out.append({
                            "type": "polygon",
                            "label": label,
                            "confidence": conf,
                            "points": pts,
                        })
                except (IndexError, Exception):
                    pass  # mask missing for this box — skip polygon

        return out

    # ── introspection ─────────────────────────────────────────────────────

    def info(self) -> dict:
        return {
            "weights": str(self._model.ckpt_path if hasattr(self._model, "ckpt_path") else "?"),
            "mode": self._mode,
            "segmentation": self._seg,
            "conf_threshold": self._conf,
            "iou_threshold": self._iou,
            "classes": list(self._model.names.values()) if hasattr(self._model, "names") else [],
        }


# ─────────────────────────── custom model stub ──────────────────────────────

class CustomModel(BaseAnnotationModel):
    """
    Template for a fully custom model.

    Implement __init__ (load weights) and predict (run inference).
    See model.py docstring for the Prediction format.
    """

    def __init__(self):
        # Example:
        #   import torch
        #   self.net = torch.load("my_weights.pt", map_location="cpu")
        #   self.net.eval()
        raise NotImplementedError("Fill in CustomModel.__init__ with your model loading code.")

    def predict(self, image: Image.Image) -> list[Prediction]:
        # w, h = image.size
        # tensor = your_preprocess(image)
        # with torch.no_grad():
        #     boxes, scores, labels = self.net(tensor)
        # return your_postprocess(boxes, scores, labels)
        raise NotImplementedError("Fill in CustomModel.predict with your inference code.")


# ─────────────────────────── active model ───────────────────────────────────
# Change this line to switch which model the API serves.
#
# No GPU? The nano model runs fine on CPU (~1–3 s/image):
#   active_model = ProductionModel()
#
# Restrict to specific labels:
#   active_model = ProductionModel(label_filter={"car", "person", "truck"})
#
# Use your fine-tuned weights (after running train.py):
#   active_model = ProductionModel(weights="runs/segment/train/weights/best.pt")
#
# Bounding boxes only (faster):
#   active_model = ProductionModel(weights="yolov8n.pt", mode="detect")
#
# Larger model for better accuracy:
#   active_model = ProductionModel(weights="yolov8l-seg.pt")

active_model: BaseAnnotationModel = ProductionModel(weights="yolov8s-seg.pt", conf=0.15)
# active_model = ProductionModel()                                          # nano  (~7 MB, fastest)
# active_model = ProductionModel(weights="yolov8m-seg.pt", conf=0.15)      # medium (~52 MB, more accurate)
# active_model = ProductionModel(weights="yolov8l-seg.pt", conf=0.15)      # large  (~88 MB, best accuracy)
# active_model = MockModel()                                                # no ML deps, random shapes
# active_model = CustomModel()                                              # your own architecture
