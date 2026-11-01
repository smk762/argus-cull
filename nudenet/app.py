"""NudeNet /infer server using the 640m weights.

The official ``ghcr.io/notai-tech/nudenet`` image ships 320n only. This
sidecar speaks the same API the curator already posts to, with
``NudeDetector(model_path=640m.onnx, inference_resolution=640)``. NudeNet
is AGPL-3.0; curator never imports it.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

from fastapi import FastAPI
from nudenet import NudeDetector
from sidecar import add_infer, decode_bgr

log = logging.getLogger("nudenet")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

_MODEL = Path(os.environ.get("NUDENET_MODEL", "/models/640m.onnx"))
_RESOLUTION = int(os.environ.get("NUDENET_RESOLUTION", "640") or "640")

if not _MODEL.is_file():
    raise SystemExit(f"NudeNet model not found: {_MODEL}")

_detector = NudeDetector(model_path=str(_MODEL), inference_resolution=_RESOLUTION)
_infer = threading.Lock()
log.info("loaded %s at %spx", _MODEL, _RESOLUTION)

app = FastAPI(title="NudeNet 640m")


def _detect_all(images: list[bytes]) -> list[list[dict]]:
    # An array, not bytes: NudeNet's own bytes path uses IMREAD_UNCHANGED,
    # which fails on grayscale or unreadable frames.
    with _infer:
        return [_detector.detect(decode_bgr(data)) for data in images]


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "model": _MODEL.name, "resolution": _RESOLUTION}


add_infer(app, "NudeNet", _detect_all)
