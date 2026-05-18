"""
main.py — AnnotateMe AI inference service.

Endpoints
---------
GET  /health          liveness probe
GET  /models          full model catalog (integrated + planned)
POST /predict         run inference on an uploaded image
"""

import io
import logging
import os
import threading

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel as PydanticModel

# torch 2.2 is missing torch.compiler.is_compiling (added in 2.3).
# transformers fast image processors call it; patch it before any import.
import torch as _torch
if not hasattr(_torch.compiler, "is_compiling"):
    _torch.compiler.is_compiling = lambda: False

from model import (
    BaseAnnotationModel, GroundedSAMModel, KITTIModel, MockModel, Prediction,
    ProductionModel, SAM2Model, YOLOWorldModel, active_model,
)

# Detect optional heavy dependencies once at startup.
# transformers v5+ requires torch>=2.4; check the actual backend availability
# rather than just the package import so the integrated flag is accurate.
try:
    from transformers.utils import is_torch_available as _is_torch_available
    HAS_TRANSFORMERS = _is_torch_available()
except ImportError:
    HAS_TRANSFORMERS = False

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="AnnotateMe AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.15"))
MAX_DETECTIONS = int(os.getenv("MAX_DETECTIONS", "100"))
CUSTOM_WEIGHTS = os.getenv("CUSTOM_WEIGHTS_PATH", "runs/segment/train/weights/best.pt")

# ── Model registry ─────────────────────────────────────────────────────────────

_registry: dict[str, BaseAnnotationModel] = {"active": active_model}
_registry_lock = threading.Lock()


def _get_model(name: str, classes: list[str] | None = None) -> BaseAnnotationModel:
    with _registry_lock:
        if name == "yolo-world":
            # Always re-apply classes if provided; create instance on first use
            if name not in _registry:
                log.info("Loading YOLO-World for the first time…")
                _registry[name] = YOLOWorldModel(classes=classes)
            elif classes:
                _registry[name].set_classes(classes)  # type: ignore[attr-defined]
            return _registry[name]

        if name not in _registry:
            log.info("Loading model '%s' for the first time — may download weights…", name)
            if name == "mock":
                _registry[name] = MockModel()
            elif name == "production":
                _registry[name] = ProductionModel(weights="yolov8s-seg.pt", conf=0.01)
            elif name == "sam2":
                _registry[name] = SAM2Model()
            elif name == "grounded-sam":
                inst = GroundedSAMModel(classes=classes)
                _registry[name] = inst
            elif name == "kitti":
                _registry[name] = KITTIModel()
            elif name == "custom":
                if not os.path.exists(CUSTOM_WEIGHTS):
                    raise FileNotFoundError(
                        f"Custom weights not found at {CUSTOM_WEIGHTS}. "
                        "Run train.py first or set CUSTOM_WEIGHTS_PATH."
                    )
                _registry[name] = ProductionModel(weights=CUSTOM_WEIGHTS, conf=0.01)
            else:
                raise ValueError(
                    f"Unknown model '{name}'. Valid: mock, production, yolo-world, sam2, "
                    "grounded-sam, kitti, custom, active"
                )
        elif name == "grounded-sam" and classes:
            _registry[name].set_classes(classes)  # type: ignore[attr-defined]
        return _registry[name]


# ── Response schemas ───────────────────────────────────────────────────────────

class PointSchema(PydanticModel):
    x: float
    y: float


class PredictionSchema(PydanticModel):
    type: str
    label: str
    confidence: float
    points: list[PointSchema]


class PredictResponse(PydanticModel):
    predictions: list[PredictionSchema]
    model: str
    image_width: int
    image_height: int
    raw_count: int
    filtered_count: int
    note: str | None = None


class HealthResponse(PydanticModel):
    status: str
    model: str


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "model": type(active_model).__name__}


@app.get("/models")
def list_models():
    """Return full model catalog. integrated=True means it can be selected now."""
    has_custom = os.path.exists(CUSTOM_WEIGHTS)
    return {
        "active": type(active_model).__name__,
        "models": [
            {
                "id": "mock",
                "name": "MockModel",
                "integrated": True,
                "badge": "DEMO",
                "badgeColor": "orange",
                "tagline": "Random shapes — no real ML",
                "description": (
                    "Generates random bounding boxes and polygons with no ML inference. "
                    "Use this to test the save / label / export workflow while you prepare "
                    "training data. Shapes are placed randomly — not based on image content."
                ),
                "bestFor": "Testing the annotation UI pipeline",
                "domains": "Any image",
                "supportsClasses": False,
                "defaultConfidence": 0.15,
                "minConfidence": 0.01,
            },
            {
                "id": "production",
                "name": "YOLOv8-seg",
                "integrated": True,
                "badge": None,
                "badgeColor": None,
                "tagline": "Pre-trained on 80 COCO classes",
                "description": (
                    "YOLOv8s segmentation model pre-trained on the COCO dataset. Returns both "
                    "bounding boxes and precise polygon masks. Fast and accurate for everyday "
                    "objects in real photographs."
                ),
                "bestFor": "Real photographs with everyday objects",
                "domains": "Street scenes, indoor, animals, vehicles",
                "supportsClasses": False,
                "defaultConfidence": 0.25,
                "minConfidence": 0.01,
            },
            {
                "id": "yolo-world",
                "name": "YOLO-World",
                "integrated": True,
                "badge": "OPEN-VOCAB",
                "badgeColor": "blue",
                "tagline": "Detect any object by typing its name",
                "description": (
                    "Open-vocabulary YOLO — type the class names you want to detect and it finds "
                    "them without any fine-tuning. Extends standard YOLO beyond the 80 COCO "
                    "classes to any concept you can name. Downloads ~100 MB weights on first use."
                ),
                "bestFor": "Custom classes on real-photo datasets",
                "domains": "Any real photographs with custom labels",
                "supportsClasses": True,
                "defaultConfidence": 0.01,
                "minConfidence": 0.01,
            },
            {
                "id": "custom",
                "name": "Custom (fine-tuned)",
                "integrated": has_custom,
                "badge": "FINE-TUNED",
                "badgeColor": "green",
                "tagline": "Your own model trained on your data",
                "description": (
                    "Your fine-tuned YOLOv8 checkpoint produced by train.py. After annotating "
                    "50–200 frames and running fine-tuning, this model learns your specific "
                    f"domain and label set. Weights: {CUSTOM_WEIGHTS}"
                ),
                "bestFor": "Your specific domain and custom labels",
                "domains": "Whatever you trained it on",
                "supportsClasses": False,
                "defaultConfidence": 0.25,
                "minConfidence": 0.01,
            },
            {
                "id": "sam2",
                "name": "SAM 2",
                "integrated": HAS_TRANSFORMERS,
                "badge": "ANY DOMAIN",
                "badgeColor": "purple",
                "tagline": "Automatic segmentation of every object — no prompts needed",
                "description": (
                    "Meta's Segment Anything Model 2. Automatically segments every visible object "
                    "in an image without any text prompts or clicks. Works on any visual domain "
                    "— photos, cartoons, medical scans, satellite imagery — without fine-tuning. "
                    "Downloads ~185 MB on first use."
                ),
                "bestFor": "Any domain where you want to segment everything automatically",
                "domains": "Any image, any domain, no prompts needed",
                "supportsClasses": False,
                "defaultConfidence": 0.50,
                "minConfidence": 0.01,
            },
            {
                "id": "grounded-sam",
                "name": "Grounded SAM",
                "integrated": HAS_TRANSFORMERS,
                "badge": "BEST QUALITY",
                "badgeColor": "purple",
                "tagline": "Type a label → auto-detect + precise polygon",
                "description": (
                    "Combines Grounding DINO (zero-shot object detection from text) with SAM "
                    "(precise polygon segmentation). Type what you want to detect and get "
                    "pixel-perfect polygon masks on any domain — zero fine-tuning needed. "
                    "Downloads ~750 MB total on first use."
                ),
                "bestFor": "Highest quality automatic annotation with custom label names",
                "domains": "Any image, any label, any domain",
                "supportsClasses": True,
                "defaultConfidence": 0.30,
                "minConfidence": 0.01,
            },
            {
                "id": "kitti",
                "name": "KITTI Detection",
                "integrated": True,
                "badge": "AUTONOMOUS DRIVING",
                "badgeColor": "orange",
                "tagline": "KITTI labels on driving scenes — no extra download needed",
                "description": (
                    "YOLOv8s with COCO→KITTI label remapping. Filters detections to driving-scene "
                    "classes and renames them to KITTI conventions: Car, Van, Truck, Pedestrian, "
                    "Cyclist, Tram. Reuses the same weights as YOLOv8-seg — no additional download. "
                    "Works offline once the base model is cached."
                ),
                "bestFor": "Autonomous driving scenes, dashcam footage, street photography",
                "domains": "Driving scenes, street-level imagery, dashcam footage",
                "supportsClasses": False,
                "defaultConfidence": 0.25,
                "minConfidence": 0.01,
            },
        ],
    }


@app.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    confidence_threshold: float = Form(CONFIDENCE_THRESHOLD),
    max_detections: int = Form(MAX_DETECTIONS),
    model_name: str = Form("active"),
    classes: str = Form(""),  # comma-separated class list for YOLO-World
):
    raw = await file.read()
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Could not decode image")

    parsed_classes = [c.strip() for c in classes.split(",") if c.strip()] if classes else None

    try:
        model = _get_model(model_name, classes=parsed_classes)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    log.info(
        "Running %s on %dx%d image (%s bytes)%s",
        type(model).__name__, image.width, image.height, len(raw),
        f" classes={parsed_classes}" if parsed_classes else "",
    )

    try:
        raw_preds: list[Prediction] = model.predict(image)
    except NotImplementedError:
        raise HTTPException(
            status_code=503,
            detail="Model not implemented. Edit packages/ai/model.py and set active_model.",
        )
    except Exception as exc:
        log.exception("Model inference failed")
        raise HTTPException(status_code=500, detail=f"Inference error: {exc}") from exc

    raw_count = len(raw_preds)
    if raw_count > 0:
        confs = [p.get("confidence", 1.0) for p in raw_preds]
        log.info("Raw predictions: %d  conf range: %.4f–%.4f", raw_count, min(confs), max(confs))
    else:
        log.info("Model returned 0 raw predictions (domain mismatch or no objects)")

    filtered = [
        p for p in raw_preds if p.get("confidence", 1.0) >= confidence_threshold
    ][:max_detections]

    log.info("Returning %d / %d predictions (threshold=%.2f)", len(filtered), raw_count, confidence_threshold)

    model_cls = type(model).__name__
    note: str | None = None
    if raw_count == 0:
        if model_cls == "SAM2Model":
            note = (
                "SAM 2 found no segments above quality thresholds. "
                "Try lowering the confidence slider or use Grounded SAM with specific class names."
            )
        elif model_cls == "GroundedSAMModel":
            note = (
                "No objects matching your class names were detected. "
                "Check spelling, be more specific (e.g. 'red car' instead of 'vehicle'), "
                "or try broader terms."
            )
        elif model_cls in ("ProductionModel",):
            note = (
                "0 detections — the COCO-trained model only works on real photographs. "
                "Synthetic/cartoon images need fine-tuning: annotate frames manually then run train.py."
            )
        elif model_cls == "YOLOWorldModel":
            note = (
                "No objects found for your class list. Try broader terms or check the image contains "
                "recognisable real-world objects."
            )
    elif len(filtered) == 0:
        confs = [p.get("confidence", 1.0) for p in raw_preds]
        note = (
            f"{raw_count} objects found but all below threshold {confidence_threshold:.2f} "
            f"(highest confidence: {max(confs):.4f}). Lower the confidence slider and try again."
        )

    return {
        "predictions": filtered,
        "model": type(model).__name__,
        "image_width": image.width,
        "image_height": image.height,
        "raw_count": raw_count,
        "filtered_count": len(filtered),
        "note": note,
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
