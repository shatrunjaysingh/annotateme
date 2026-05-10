"""
main.py — AnnotateMe AI inference service.

Endpoints
---------
GET  /health          liveness probe
POST /predict         run the active model on an uploaded image
"""

import io
import logging
import os

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel as PydanticModel

from model import Prediction, active_model

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="AnnotateMe AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))
MAX_DETECTIONS = int(os.getenv("MAX_DETECTIONS", "100"))


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


class HealthResponse(PydanticModel):
    status: str
    model: str


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "model": type(active_model).__name__}


@app.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
    max_detections: int = MAX_DETECTIONS,
):
    raw = await file.read()
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Could not decode image")

    log.info("Running inference on %dx%d image (%s bytes)", image.width, image.height, len(raw))

    try:
        raw_preds: list[Prediction] = active_model.predict(image)
    except NotImplementedError:
        raise HTTPException(
            status_code=503,
            detail="Model not implemented. Edit packages/ai/model.py and set active_model.",
        )
    except Exception as exc:
        log.exception("Model inference failed")
        raise HTTPException(status_code=500, detail=f"Inference error: {exc}") from exc

    # Filter by confidence and cap count
    filtered = [
        p for p in raw_preds if p.get("confidence", 1.0) >= confidence_threshold
    ][:max_detections]

    log.info("Returning %d predictions (threshold=%.2f)", len(filtered), confidence_threshold)

    return {
        "predictions": filtered,
        "model": type(active_model).__name__,
        "image_width": image.width,
        "image_height": image.height,
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
