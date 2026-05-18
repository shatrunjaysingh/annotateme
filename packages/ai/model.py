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


def _binary_mask_to_polygon(mask: np.ndarray, epsilon_factor: float = 0.005,
                             min_area: int = 100) -> list[Point]:
    """
    Convert a binary mask (H×W bool/uint8) to a polygon point list.
    Uses OpenCV contour tracing when available, falls back to RDP on boundary pixels.
    """
    mask = mask.astype(np.uint8)
    try:
        import cv2  # available via ultralytics
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return []
        contour = max(contours, key=cv2.contourArea)
        if cv2.contourArea(contour) < min_area:
            return []
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon_factor * peri, True)
        pts = approx.reshape(-1, 2)
        return [{"x": float(p[0]), "y": float(p[1])} for p in pts] if len(pts) >= 3 else []
    except ImportError:
        rows, cols = np.where(mask > 0)
        if len(rows) < 3:
            return []
        return _mask_to_polygon(np.column_stack([cols, rows]), epsilon=2.0)


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

class YOLOWorldModel(BaseAnnotationModel):
    """
    YOLO-World: open-vocabulary detection — detect any object by typing its name.

    Unlike standard YOLO (fixed 80 COCO classes), YOLO-World accepts arbitrary
    text class names and finds them in the image without fine-tuning.

    Parameters
    ----------
    classes : list[str]
        Class names to detect, e.g. ["car", "scratch", "tumour"].
        Defaults to a broad set of common objects.
    conf : float
        Minimum confidence threshold (default 0.01, filtered by API).
    weights : str
        YOLO-World checkpoint. "yolov8s-worldv2.pt" (~100 MB, auto-downloads).
    """

    DEFAULT_CLASSES = ["person", "car", "truck", "bus", "bicycle", "motorcycle",
                       "dog", "cat", "chair", "table", "bottle", "bag"]

    def __init__(
        self,
        classes: list[str] | None = None,
        conf: float = 0.01,
        weights: str = "yolov8s-worldv2.pt",
    ) -> None:
        try:
            from ultralytics import YOLOWorld  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "ultralytics is not installed or too old for YOLO-World.\n"
                "Run: pip install 'ultralytics>=8.1'"
            ) from exc

        self._model = YOLOWorld(weights)
        self._conf = conf
        self._classes = classes or self.DEFAULT_CLASSES
        self._model.set_classes(self._classes)

    def set_classes(self, classes: list[str]) -> None:
        self._classes = classes
        self._model.set_classes(classes)

    def predict(self, image: Image.Image) -> list[Prediction]:
        results = self._model.predict(
            source=image, conf=self._conf, verbose=False
        )
        result = results[0]
        names: dict[int, str] = result.names
        out: list[Prediction] = []
        for box in result.boxes:
            label = names[int(box.cls[0])]
            conf = round(float(box.conf[0]), 4)
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
            out.append({
                "type": "rect",
                "label": label,
                "confidence": conf,
                "points": [{"x": x1, "y": y1}, {"x": x2, "y": y2}],
            })
        return out


class SAM2Model(BaseAnnotationModel):
    """
    Meta Segment Anything Model 2 — automatic segmentation of every object.

    No text prompts or clicks needed. Generates masks for all visible objects
    and works on any visual domain (photos, cartoons, medical, satellite…).
    Downloads ~185 MB of weights from HuggingFace on first use.

    Parameters
    ----------
    model_id : str
        HuggingFace model id.  Options (smaller→larger, faster→more accurate):
          "facebook/sam2-hiera-tiny"    ~38 MB
          "facebook/sam2-hiera-small"   ~185 MB  (default)
          "facebook/sam2-hiera-base-plus"
          "facebook/sam2-hiera-large"
    pred_iou_thresh : float
        Keep masks whose predicted IoU exceeds this (default 0.7).
    stability_score_thresh : float
        Keep masks with stability score above this (default 0.85).
    points_per_batch : int
        SAM2 samples a grid of points; fewer = faster (default 32).
    """

    def __init__(
        self,
        model_id: str = "facebook/sam2-hiera-small",
        pred_iou_thresh: float = 0.50,
        stability_score_thresh: float = 0.65,
        points_per_batch: int = 64,
        device: str | None = None,
    ) -> None:
        try:
            from transformers import pipeline as hf_pipeline  # type: ignore
            import torch
        except ImportError as exc:
            raise ImportError(
                "transformers is not installed.\n"
                "Run: pip install 'transformers>=4.40.0' accelerate"
            ) from exc

        if device is None:
            import torch
            device = (
                "cuda" if torch.cuda.is_available() else
                "mps"  if torch.backends.mps.is_available() else
                "cpu"
            )

        self._pipe = hf_pipeline(
            "mask-generation", model=model_id,
            device=device,
        )
        self._iou_thresh   = pred_iou_thresh
        self._stab_thresh  = stability_score_thresh
        self._ppb          = points_per_batch

    def predict(self, image: Image.Image) -> list[Prediction]:
        import torch
        with torch.no_grad():
            outputs = self._pipe(
                image,
                pred_iou_thresh=self._iou_thresh,
                stability_score_thresh=self._stab_thresh,
                points_per_batch=self._ppb,
            )

        # Pipeline returns a list of {"mask": PIL|ndarray, "score": float}
        items: list = outputs if isinstance(outputs, list) else []
        preds: list[Prediction] = []

        for item in items:
            raw_mask = item.get("mask") or item.get("segmentation")
            score    = float(item.get("score", 0.9))
            if raw_mask is None:
                continue
            mask_arr = np.array(raw_mask).astype(np.uint8)
            pts = _binary_mask_to_polygon(mask_arr)
            if pts:
                preds.append({
                    "type":       "polygon",
                    "label":      "object",
                    "confidence": round(score, 4),
                    "points":     pts,
                })

        return preds


class GroundedSAMModel(BaseAnnotationModel):
    """
    Grounded SAM = Grounding DINO (text → boxes) + SAM (boxes → polygons).

    Type any class names and get pixel-perfect polygon masks — zero-shot,
    no fine-tuning, any domain.
    Downloads ~375 MB (Grounding DINO) + ~375 MB (SAM) on first use.

    Parameters
    ----------
    classes : list[str]
        Default class names to detect.  Can be overridden per-request
        via set_classes() or the 'classes' API field.
    dino_model_id : str
        HuggingFace id for Grounding DINO (zero-shot object detector).
    sam_model_id : str
        HuggingFace id for SAM (segmentation).
    box_threshold : float
        Grounding DINO box confidence cutoff (default 0.30).
    text_threshold : float
        Grounding DINO text similarity cutoff (default 0.25).
    """

    DEFAULT_CLASSES = ["object", "person", "car", "animal"]

    def __init__(
        self,
        classes: list[str] | None = None,
        dino_model_id: str = "IDEA-Research/grounding-dino-base",
        sam_model_id:  str = "facebook/sam-vit-base",
        box_threshold:  float = 0.30,
        text_threshold: float = 0.25,
        device: str | None = None,
    ) -> None:
        try:
            import torch
            from transformers import (  # type: ignore
                AutoProcessor,
                AutoModelForZeroShotObjectDetection,
                SamModel,
                SamProcessor,
            )
        except ImportError as exc:
            raise ImportError(
                "transformers is not installed.\n"
                "Run: pip install 'transformers>=4.40.0' accelerate"
            ) from exc

        import torch
        if device is None:
            device = (
                "cuda" if torch.cuda.is_available() else
                "mps"  if torch.backends.mps.is_available() else
                "cpu"
            )

        self._device      = device
        self._box_thresh  = box_threshold
        self._text_thresh = text_threshold
        self._classes     = classes or self.DEFAULT_CLASSES

        # Grounding DINO — zero-shot object detector
        self._dino_proc  = AutoProcessor.from_pretrained(dino_model_id)
        self._dino_model = AutoModelForZeroShotObjectDetection.from_pretrained(
            dino_model_id
        ).to(device)

        # SAM — segment each detected box
        self._sam_proc  = SamProcessor.from_pretrained(sam_model_id)
        self._sam_model = SamModel.from_pretrained(sam_model_id).to(device)

    def set_classes(self, classes: list[str]) -> None:
        self._classes = classes

    def predict(self, image: Image.Image) -> list[Prediction]:
        import torch

        text_prompt = ". ".join(self._classes) + "."

        # ── Step 1: Grounding DINO → bounding boxes ───────────────────────────
        dino_inputs = self._dino_proc(
            images=image, text=text_prompt, return_tensors="pt"
        ).to(self._device)

        with torch.no_grad():
            dino_out = self._dino_model(**dino_inputs)

        # transformers ≥4.45 renamed box_threshold → threshold
        try:
            results = self._dino_proc.post_process_grounded_object_detection(
                dino_out,
                dino_inputs.input_ids,
                threshold=self._box_thresh,
                text_threshold=self._text_thresh,
                target_sizes=[(image.height, image.width)],
            )[0]
        except TypeError:
            results = self._dino_proc.post_process_grounded_object_detection(
                dino_out,
                dino_inputs.input_ids,
                box_threshold=self._box_thresh,
                text_threshold=self._text_thresh,
                target_sizes=[(image.height, image.width)],
            )[0]

        boxes  = results["boxes"].cpu().tolist()
        labels = results["labels"]
        scores = results["scores"].cpu().tolist()

        if not boxes:
            return []

        # ── Step 2: SAM → polygon mask for each box ───────────────────────────
        preds: list[Prediction] = []

        for box, label, score in zip(boxes, labels, scores):
            x1, y1, x2, y2 = [float(v) for v in box]
            conf = round(score, 4)

            # Always emit a bounding box
            preds.append({
                "type":       "rect",
                "label":      label,
                "confidence": conf,
                "points":     [{"x": x1, "y": y1}, {"x": x2, "y": y2}],
            })

            # Try to get a precise polygon via SAM
            try:
                sam_inputs = self._sam_proc(
                    images=image,
                    input_boxes=[[box]],
                    return_tensors="pt",
                ).to(self._device)

                with torch.no_grad():
                    sam_out = self._sam_model(**sam_inputs)

                masks = self._sam_proc.post_process_masks(
                    sam_out.pred_masks.cpu(),
                    sam_inputs["original_sizes"].cpu(),
                    sam_inputs["reshaped_input_sizes"].cpu(),
                )[0]

                # Pick the mask with the highest predicted IoU
                iou_scores = sam_out.iou_scores[0, 0].cpu().numpy()
                best = int(np.argmax(iou_scores))
                mask_arr = masks[0, best].numpy().astype(np.uint8)

                pts = _binary_mask_to_polygon(mask_arr)
                if pts:
                    preds.append({
                        "type":       "polygon",
                        "label":      label,
                        "confidence": conf,
                        "points":     pts,
                    })
            except Exception:
                pass  # SAM failed for this box — bounding box was already added

        return preds


class KITTIModel(BaseAnnotationModel):
    """
    KITTI-domain object detection using YOLOv8s with COCO→KITTI label remapping.

    Instead of a separate fine-tuned checkpoint (which require private HF auth),
    this reuses the same YOLOv8s-seg weights as ProductionModel — already cached
    locally — and filters detections to the COCO classes that map cleanly onto
    KITTI categories:

        COCO class       → KITTI label
        ─────────────────────────────
        person           → Pedestrian
        bicycle          → Cyclist
        motorcycle       → Cyclist
        car              → Car
        bus              → Van
        truck            → Truck
        train            → Tram

    No extra download is required. Works offline once YOLOv8s-seg.pt is cached.

    Parameters
    ----------
    conf : float
        Minimum detection confidence (default 0.25).
    iou : float
        NMS IoU threshold (default 0.45).
    device : str | None
        Inference device: "cpu", "cuda", "mps", or None for auto.
    """

    # COCO label → KITTI label (non-listed COCO classes are dropped)
    _COCO_TO_KITTI: dict[str, str] = {
        "person":     "Pedestrian",
        "bicycle":    "Cyclist",
        "motorcycle": "Cyclist",
        "car":        "Car",
        "bus":        "Van",
        "truck":      "Truck",
        "train":      "Tram",
    }

    def __init__(
        self,
        conf: float = 0.25,
        iou: float = 0.45,
        device: str | None = None,
    ) -> None:
        try:
            from ultralytics import YOLO  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "ultralytics is not installed. Run: pip install ultralytics"
            ) from exc

        # Reuse the same weights already pulled by ProductionModel — no extra download.
        self._model  = YOLO("yolov8s-seg.pt")
        self._conf   = conf
        self._iou    = iou
        self._device = device

    def predict(self, image: Image.Image) -> list[Prediction]:
        results = self._model.predict(
            source=image,
            conf=self._conf,
            iou=self._iou,
            verbose=False,
            device=self._device,
        )
        result = results[0]
        names: dict[int, str] = result.names
        out: list[Prediction] = []
        for box in result.boxes:
            coco_label  = names[int(box.cls[0])]
            kitti_label = self._COCO_TO_KITTI.get(coco_label)
            if kitti_label is None:
                continue  # drop non-driving-scene classes
            conf = round(float(box.conf[0]), 4)
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
            out.append({
                "type":       "rect",
                "label":      kitti_label,
                "confidence": conf,
                "points":     [{"x": x1, "y": y1}, {"x": x2, "y": y2}],
            })
        return out


class CustomModel(BaseAnnotationModel):
    """
    Template for a fully custom model.

    Implement __init__ (load weights) and predict (run inference).
    See model.py docstring for the Prediction format.
    """

    def __init__(self):
        raise NotImplementedError("Fill in CustomModel.__init__ with your model loading code.")

    def predict(self, image: Image.Image) -> list[Prediction]:
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

# MockModel returns random realistic shapes — useful while fine-tuning your own data.
# Switch to ProductionModel once you have domain-specific weights from train.py.
active_model: BaseAnnotationModel = MockModel()
# active_model = ProductionModel(weights="yolov8s-seg.pt", conf=0.01)      # real photos (COCO 80 classes)
# active_model = ProductionModel(weights="yolov8n-seg.pt", conf=0.01)      # nano  (~7 MB, fastest)
# active_model = ProductionModel(weights="yolov8m-seg.pt", conf=0.01)      # medium (~52 MB, more accurate)
# active_model = ProductionModel(weights="yolov8l-seg.pt", conf=0.01)      # large  (~88 MB, best accuracy)
# active_model = ProductionModel(weights="runs/segment/train/weights/best.pt", conf=0.01)  # your fine-tuned
# active_model = CustomModel()                                              # your own architecture
