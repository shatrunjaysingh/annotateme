"""
main.py — AnnotateMe AI inference service.

Endpoints
---------
GET  /health          liveness probe
GET  /models          list available models and which is active
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

from model import BaseAnnotationModel, MockModel, Prediction, ProductionModel, active_model

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
# Models are loaded lazily on first use and cached for subsequent requests.

_registry: dict[str, BaseAnnotationModel] = {"active": active_model}
_registry_lock = threading.Lock()


def _get_model(name: str) -> BaseAnnotationModel:
    with _registry_lock:
        if name not in _registry:
            log.info("Loading model '%s' for the first time…", name)
            if name == "mock":
                _registry[name] = MockModel()
            elif name == "production":
                _registry[name] = ProductionModel(weights="yolov8s-seg.pt", conf=0.01)
            elif name == "custom":
                if not os.path.exists(CUSTOM_WEIGHTS):
                    raise FileNotFoundError(
                        f"Custom weights not found at {CUSTOM_WEIGHTS}. "
                        "Run train.py first or set CUSTOM_WEIGHTS_PATH."
                    )
                _registry[name] = ProductionModel(weights=CUSTOM_WEIGHTS, conf=0.01)
            else:
                raise ValueError(f"Unknown model '{name}'. Valid: mock, production, custom, active")
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


class ModelsResponse(PydanticModel):
    available: list[dict]
    active: str


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "model": type(active_model).__name__}


@app.get("/models", response_model=ModelsResponse)
def list_models():
    available = [
        {"id": "mock",       "name": "MockModel",       "description": "Random shapes — no ML, always works. Use while training your own model."},
        {"id": "production", "name": "ProductionModel", "description": "YOLOv8s-seg pre-trained on COCO (80 classes). Works on real photographs."},
    ]
    if os.path.exists(CUSTOM_WEIGHTS):
        available.append({
            "id": "custom",
            "name": "Custom (fine-tuned)",
            "description": f"Your fine-tuned model: {CUSTOM_WEIGHTS}",
        })
    return {"available": available, "active": type(active_model).__name__}


@app.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    confidence_threshold: float = Form(CONFIDENCE_THRESHOLD),
    max_detections: int = Form(MAX_DETECTIONS),
    model_name: str = Form("active"),
):
    raw = await file.read()
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Could not decode image")

    try:
        model = _get_model(model_name)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    log.info(
        "Running %s on %dx%d image (%s bytes)",
        type(model).__name__, image.width, image.height, len(raw),
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

    note: str | None = None
    if raw_count == 0:
        note = (
            "Model returned 0 detections. If this is a synthetic/cartoon image the COCO-trained "
            "model won't detect objects — annotate frames manually then run train.py to fine-tune."
        )
    elif len(filtered) == 0:
        confs = [p.get("confidence", 1.0) for p in raw_preds]
        note = (
            f"{raw_count} objects found but all below threshold {confidence_threshold:.2f} "
            f"(highest was {max(confs):.4f}). Lower the confidence slider and try again."
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
