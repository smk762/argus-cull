FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# 640m weights (same 98.7 MB file as NudeNet v3.4-weights). GitHub's release
# URL serves an HTML login page to unauthenticated ADD; this Hub copy is the
# same ONNX. The pypi package only bundles 320n.
ARG NUDENET_640M_URL=https://huggingface.co/zhangsongbo365/nudenet_onnx/resolve/main/640m.onnx
ARG NUDENET_640M_SHA256=5fd488c39acfb268efb4a92bce4fbc95967c059bd7ee1c01026fcaf81aec5c9e
RUN mkdir -p /models \
    && curl -fL --retry 3 -o /models/640m.onnx "${NUDENET_640M_URL}" \
    && echo "${NUDENET_640M_SHA256}  /models/640m.onnx" | sha256sum -c -

# sidecar.py comes from the `common` build context (docker-compose.yaml;
# plain docker build: --build-context common=../sidecar-common).
COPY --from=common sidecar.py .
COPY app.py .
ENV PYTHONUNBUFFERED=1 \
    NUDENET_MODEL=/models/640m.onnx \
    NUDENET_RESOLUTION=640
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
