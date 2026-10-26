"""Scan the committed fixture with the CPU engine. No face, scene, or garment models."""

from __future__ import annotations

from pathlib import Path

from argus_curator.scanner import scan_folder

ROOT = Path(__file__).resolve().parents[1] / "fixture"


def main() -> None:
    summary = scan_folder(ROOT)
    by_path = {result.rel_path: result for result in summary.results}
    if summary.total < 8:
        raise SystemExit(f"expected at least 8 images, got {summary.total}")

    blurry = by_path["rejects/blurry.png"]
    if blurry.passed or "blurry" not in (blurry.reject_reason or ""):
        raise SystemExit(f"blurry frame was not rejected: {blurry.reject_reason}")

    original = by_path["duplicates/original.png"]
    copy = by_path["duplicates/copy.png"]
    if not original.passed or not copy.passed:
        raise SystemExit("the duplicate pair must stay sharp enough to pass")
    if original.phash != copy.phash:
        raise SystemExit("the duplicate pair does not share a perceptual hash")
    if not (original.is_duplicate or copy.is_duplicate):
        raise SystemExit("the identical pair was not grouped")
    if original.similar_group != copy.similar_group or original.group_size != 2:
        raise SystemExit("the identical pair is not one cluster of two")

    print(f"fixture scan ok: {summary.total} images, {summary.duplicates} duplicates, {summary.rejected} rejected")


if __name__ == "__main__":
    main()
