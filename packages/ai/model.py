"""
model.py — Plug your model in here.

Implement the predict() method of CustomModel and set `active_model = CustomModel()`
at the bottom of this file.  The FastAPI server in main.py calls active_model.predict(image).

Prediction schema
-----------------
Each prediction must be a dict with:
  type        : "rect" | "polygon"
  label       : str   — must match a label name in your AnnotateMe project
  confidence  : float — 0.0 – 1.0
  points      : list of {"x": float, "y": float} in IMAGE pixel coordinates

  rect    → exactly 2 points: top-left then bottom-right
  polygon → 3+ points forming the polygon contour (no need to close the path)
"""

from __future__ import annotations

import random
from abc import ABC, abstractmethod
from typing import Literal, TypedDict

from PIL import Image


# ── Prediction type ────────────────────────────────────────────────────────────

class Point(TypedDict):
    x: float
    y: float


class Prediction(TypedDict):
    type: Literal["rect", "polygon"]
    label: str
    confidence: float
    points: list[Point]


# ── Base interface ─────────────────────────────────────────────────────────────

class BaseAnnotationModel(ABC):
    @abstractmethod
    def predict(self, image: Image.Image) -> list[Prediction]:
        """Run inference on a PIL image and return predictions."""
        ...


# ── Mock model (works with no ML deps — useful for testing the pipeline) ───────

class MockModel(BaseAnnotationModel):
    """Returns plausible-looking fake detections so you can test the full
    frontend → backend → AI-service → canvas pipeline without a real model."""

    LABELS = ["car", "person", "bicycle", "truck", "dog"]

    def predict(self, image: Image.Image) -> list[Prediction]:
        w, h = image.size
        results: list[Prediction] = []
        for _ in range(random.randint(1, 4)):
            label = random.choice(self.LABELS)
            x1 = random.uniform(0.05, 0.45) * w
            y1 = random.uniform(0.05, 0.45) * h
            x2 = x1 + random.uniform(0.1, 0.4) * w
            y2 = y1 + random.uniform(0.1, 0.4) * h
            x2, y2 = min(x2, w - 1), min(y2, h - 1)
            if random.random() < 0.3:
                # Occasionally emit a polygon instead of a rect
                pts = self._jitter_rect_to_polygon(x1, y1, x2, y2)
                results.append({"type": "polygon", "label": label,
                                 "confidence": round(random.uniform(0.55, 0.99), 3),
                                 "points": pts})
            else:
                results.append({"type": "rect", "label": label,
                                 "confidence": round(random.uniform(0.55, 0.99), 3),
                                 "points": [{"x": x1, "y": y1}, {"x": x2, "y": y2}]})
        return results

    @staticmethod
    def _jitter_rect_to_polygon(x1, y1, x2, y2) -> list[Point]:
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        return [
            {"x": x1 + random.uniform(-5, 5), "y": y1 + random.uniform(-5, 5)},
            {"x": cx,                          "y": y1 + random.uniform(-8, 0)},
            {"x": x2 + random.uniform(-5, 5), "y": y1 + random.uniform(-5, 5)},
            {"x": x2 + random.uniform(0, 8),  "y": cy},
            {"x": x2 + random.uniform(-5, 5), "y": y2 + random.uniform(-5, 5)},
            {"x": cx,                          "y": y2 + random.uniform(0, 8)},
            {"x": x1 + random.uniform(-5, 5), "y": y2 + random.uniform(-5, 5)},
            {"x": x1 + random.uniform(-8, 0), "y": cy},
        ]


# ── YOLO wrapper (uncomment ultralytics in requirements.txt to use) ────────────

class YOLOModel(BaseAnnotationModel):
    """Wraps a Ultralytics YOLO model for bounding-box detection.

    Usage:
        model = YOLOModel("yolov8n.pt")           # pre-trained COCO weights
        model = YOLOModel("runs/train/weights/best.pt")  # your custom weights
    """

    def __init__(self, weights: str = "yolov8n.pt", conf: float = 0.25):
        try:
            from ultralytics import YOLO  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "ultralytics is not installed.  "
                "Add it to requirements.txt and rebuild the container."
            ) from exc
        self._model = YOLO(weights)
        self._conf = conf

    def predict(self, image: Image.Image) -> list[Prediction]:
        results = self._model(image, conf=self._conf, verbose=False)[0]
        preds: list[Prediction] = []
        names = results.names
        for box in results.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            preds.append({
                "type": "rect",
                "label": names[int(box.cls[0])],
                "confidence": round(float(box.conf[0]), 3),
                "points": [{"x": x1, "y": y1}, {"x": x2, "y": y2}],
            })
        return preds


# ── Your custom model — implement this ────────────────────────────────────────

class CustomModel(BaseAnnotationModel):
    """
    Replace this with your own model.

    Steps:
      1. Load your weights / initialise your framework in __init__.
      2. Implement predict(): accept a PIL Image, return list[Prediction].
      3. Change the active_model line at the bottom to: active_model = CustomModel()
    """

    def __init__(self):
        # Example: self.model = torch.load("my_model.pt")
        raise NotImplementedError(
            "CustomModel is not implemented yet.  "
            "See model.py for instructions."
        )

    def predict(self, image: Image.Image) -> list[Prediction]:
        # w, h = image.size
        # tensor = preprocess(image)
        # with torch.no_grad():
        #     output = self.model(tensor)
        # return postprocess(output, w, h)
        raise NotImplementedError


# ── Active model — change this line to switch implementations ──────────────────

active_model: BaseAnnotationModel = MockModel()
# active_model = YOLOModel("yolov8n.pt")
# active_model = CustomModel()
