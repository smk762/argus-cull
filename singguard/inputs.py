"""What app.py checks before it loads the model or decodes a request's image.

Kept apart from app.py so the checks can be tested without torch or transformers.
"""

from __future__ import annotations

import base64
import binascii
import io
import re
import warnings

from PIL import Image, UnidentifiedImageError

# The model loads with trust_remote_code, so the revision fixes the code that runs
# as well as the weights. A branch or tag can move; only a full commit sha cannot.
# The default model's pin is its Hub head on 2026-11-17 (unchanged since 2026-06-23;
# the repo is now inclusionAI/SingGuard-4b and the old name redirects to it).
PINNED_REVISIONS = {
    "inclusionAI/Sing-Guard-4b": "4e082d0663ef44a44fc4d31c045294566d940e73",
    "inclusionAI/SingGuard-4b": "4e082d0663ef44a44fc4d31c045294566d940e73",
}
_SHA = re.compile(r"[0-9a-f]{40}")

# A request's image: the base64 text, then the decoded pixel count. 80 MP takes a
# 61 MP camera frame and stays under Pillow's own bomb warning (about 89 MP).
MAX_ENCODED_CHARS = 64 * 1024 * 1024
MAX_PIXELS = 80_000_000


def model_revision(model: str, revision: str | None) -> str:
    """The commit sha to load *model* at. Raises SystemExit when none is pinned.

    *revision* (``SINGGUARD_REVISION``) wins and must be a full 40-character
    commit sha. Without it, a model this file pins loads at that pin; any
    other model refuses to start rather than run the Hub's moving head.
    """
    wanted = (revision or "").strip()
    if wanted:
        if not _SHA.fullmatch(wanted):
            raise SystemExit(
                f"SINGGUARD_REVISION must be a full 40-character commit sha (trust_remote_code is on), got {wanted!r}"
            )
        return wanted
    pinned = PINNED_REVISIONS.get(model)
    if pinned is None:
        raise SystemExit(
            f"{model} loads with trust_remote_code: set SINGGUARD_REVISION to the Hub commit sha to run"
        )
    return pinned


def decode_image(encoded: str, max_pixels: int = MAX_PIXELS) -> Image.Image:
    """The request's image, decoded. Raises ValueError for anything that is not a bounded image."""
    if len(encoded) > MAX_ENCODED_CHARS:
        raise ValueError("image_base64 is too large")
    try:
        raw = base64.b64decode(encoded, validate=True)
        with warnings.catch_warnings():
            # Pillow only warns between its limit and twice it; treat that as refused too.
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(raw))
            width, height = image.size
            if width * height > max_pixels:
                raise ValueError(f"image is {width}x{height}, over {max_pixels} pixels")
            image.load()
    except (
        binascii.Error,
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise ValueError("image_base64 is not an image") from exc
    return image
