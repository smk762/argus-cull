FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# CPU torch: this sidecar must not take the GPU from curator or Comfy.
# torchvision comes from the same index, or ultralytics pulls a PyPI build
# that does not match torch and NMS fails at the first detect.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# EraX-NSFW-V1.0 small (Apache-2.0). n/s/m are on the same Hub repo. The
# URL names a Hub commit, and the checksum is that file's, so a re-upload
# or an error page fails the build instead of changing the detector.
ARG ERAX_URL=https://huggingface.co/erax-ai/EraX-NSFW-V1.0/resolve/aea60ac8d2ebcbe0fcbb29e623eba99945b988a6/erax_nsfw_yolo11s.pt
ARG ERAX_SHA256=cd268d5ac84058fc9f3681bcc5446775e7ca1fdcf53948277a8b7ba12055eb10
RUN mkdir -p /models \
    && curl -fL --retry 3 -o /models/erax_nsfw_yolo11s.pt "${ERAX_URL}" \
    && echo "${ERAX_SHA256}  /models/erax_nsfw_yolo11s.pt" | sha256sum -c -

# sidecar.py comes from the `common` build context (docker-compose.yaml;
# plain docker build: --build-context common=../sidecar-common).
COPY --from=common sidecar.py .
COPY app.py .
ENV PYTHONUNBUFFERED=1 \
    ERAX_MODEL=/models/erax_nsfw_yolo11s.pt \
    ERAX_CONF=0.2 \
    ERAX_IOU=0.3
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
