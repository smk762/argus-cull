FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# The CUDA wheel matches a driver new enough for CUDA 12.4. Weights are not in
# the image; the container downloads them into the HF cache on first start.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124 \
    && pip install --no-cache-dir -r requirements.txt

COPY parse.py app.py ./
ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/data/hf \
    SINGGUARD_MODEL=inclusionAI/Sing-Guard-4b \
    PORT=9150
EXPOSE 9150
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9150"]
