FROM python:3.11-slim

# System deps needed by OpenCV / Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps (cached layer — only rebuilds when requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Pre-download model weights at build time so first request is instant.
# Comment this out if you prefer lazy download or are supplying custom weights.
RUN python3 -c "from ultralytics import YOLO; YOLO('yolov8n-seg.pt')" 2>/dev/null || true

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
