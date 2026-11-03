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

# fancyfeast's YOLO11x watermark detector, the one behind JoyCaption's
# watermark tags (Space fancyfeast/joycaption-watermark-detection; no license
# stated, so it is fetched at build time, never redistributed). The URL names a
# Hub commit and the checksum is that file's, so a re-upload or an error page
# fails the build instead of changing the detector.
#
# Lighter and CC-BY-4.0: mnemic's YOLOv8s (faster on CPU; set WATERMARK_IMGSZ=640):
#   --build-arg WATERMARK_URL=https://huggingface.co/mnemic/watermarks_yolov8/resolve/8e764d6b715afab10f27908f111a906486affafb/watermarks_s_yolov8_v1.pt
#   --build-arg WATERMARK_SHA256=234f6ab07701dcc45127758b2e111e6c288f2fdcf6c96438ec508297b4264a49
ARG WATERMARK_URL=https://huggingface.co/spaces/fancyfeast/joycaption-watermark-detection/resolve/9bb8f6a9054346e747adc7270b2cfa93849ae514/yolo11x-train28-best.pt
ARG WATERMARK_SHA256=80b022e94239a65a3b50173096523f202ca39608b9063dd391d043323a51326e
RUN mkdir -p /models \
    && curl -fL --retry 3 -o /models/watermark.pt "${WATERMARK_URL}" \
    && echo "${WATERMARK_SHA256}  /models/watermark.pt" | sha256sum -c -

# sidecar.py comes from the `common` build context (docker-compose.yaml;
# plain docker build: --build-context common=../sidecar-common).
COPY --from=common sidecar.py .
COPY app.py .
ENV PYTHONUNBUFFERED=1 \
    WATERMARK_MODEL=/models/watermark.pt \
    WATERMARK_CONF=0.2 \
    WATERMARK_IOU=0.5 \
    WATERMARK_IMGSZ=1024
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
