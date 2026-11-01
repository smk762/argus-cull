FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# CPU torch: this sidecar must not take the GPU from curator or Comfy.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# EraX-NSFW-V1.0 small (Apache-2.0). n/s/m are on the same Hub repo.
ADD https://huggingface.co/erax-ai/EraX-NSFW-V1.0/resolve/main/erax_nsfw_yolo11s.pt /models/erax_nsfw_yolo11s.pt

COPY app.py .
ENV PYTHONUNBUFFERED=1 \
    ERAX_MODEL=/models/erax_nsfw_yolo11s.pt \
    ERAX_CONF=0.2 \
    ERAX_IOU=0.3 \
    PORT=8080
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
