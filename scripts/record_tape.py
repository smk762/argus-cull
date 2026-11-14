"""Record a curator scan as the static demo's data tape (web/public/data-tape by default).

    # From a running curator: the newest finished scan, or --scan-id
    python scripts/record_tape.py live --curator http://localhost:8101 [--scan-id ID] [--images DIR] [--labels FILE]

    # Offline: a saved scan (GET /scan/{id} as JSON) and the folder it scanned
    python scripts/record_tape.py saved --scan scan.json --images DIR [--health …] [--detectors …] [--policies …] [--select …]

The tape is what `make pages` (CULL_STATIC=1) serves instead of the curator and
the page's API routes:

    tape.json          provenance (kind, curator version, generated_at), the scan
                       config, run stats, /health, /detectors, /guard/policies, the
                       blur policy, the scan list, the recorded keep set, and the
                       rel_path -> file id map
    scan.json          the scan summary (GET /scan/{id}) with every detector field and
                       verdict, minus the detail-only fields below
    detail/<id>.json   per image: score_breakdown and the NudeNet / EraX boxes, read
                       when the detail view opens
    cohorts.json       the cohort rules (the repo's cohorts.json unless --cohorts)
    captions.json      caption sidecars by abs_path, from --images or --captions
    labels.json        the labels file for the scanned folder (--labels), or empty
    run_stats.json     the page's Run stats download, when --run-stats names one
    PROVENANCE.md      where the images came from (--provenance-doc), linked from the
                       sidebar's About this tape beside the --about summary
    thumbs/<id>.webp   480 px thumbnails;  images/<id>.webp  1600 px views

Paths are rewritten under /data/images (the container's source mount), so no
host path, user name or host name lands in the tape; the script fails if one
still looks like it did. Needs Pillow. Set CULL_TAPE_DIR or --out to write
elsewhere (the page reads NEXT_PUBLIC_CULL_TAPE_URL, /data-tape by default).
"""

from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "web" / "public" / "data-tape"
SOURCE = "/data/images"
EXPORT = "/data/out"
FORMAT = "argus-cull-tape"
VERSION = 1
THUMB_PX = 480
IMAGE_PX = 1600
# The curator's select body for the page's default filters: selectBody(DEFAULT_FILTER, …) in web/src/lib/select.ts.
# web/src/lib/tape.test.ts holds the two to each other.
DEFAULT_SELECT: dict[str, Any] = {
    "min_score": 0.6,
    "keep_similar": False,
    "face_clusters": None,
    "face_poses": None,
    "face_genders": None,
    "face_ages": None,
    "min_age_years": None,
    "max_age_years": None,
    "min_attribute_conf": 0,
    "scenes": None,
    "scene_environments": None,
    "min_scene_conf": 0.1,
    "garments": None,
    "exclude_garments": None,
    "min_garment_conf": 0.5,
    "garments_uncropped": False,
    "nsfw_threshold": None,
    "nsfw_label_thresholds": None,
    "content_ratings": None,
    "guard_unsafe": False,
    "guard_rules": None,
}
CONFIG_KEYS = ("faces_config", "scenes_config", "garments_config", "nsfw_config", "erax_config", "guard_config", "prefilter_config", "crop_config", "target_profile")
# Looks like something that identifies a machine or a person: a home directory, a private address, a .local/.lan host.
LEAKS = re.compile(r"/home/|/Users/|\\Users\\|\b(?:10\.\d+|127\.\d+|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d+\.\d+\b|\b[\w-]+\.(?:local|lan|internal)\b")


def file_id(rel_path: str) -> str:
    return hashlib.sha256(rel_path.encode()).hexdigest()[:16]


# ---------------------------------------------------------------- sources


class Curator:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")

    def _open(self, path: str, body: Any = None) -> bytes:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(f"{self.base}{path}", data=data, headers={"Content-Type": "application/json"} if data else {})
        with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310 (a URL the operator passed)
            return response.read()

    def json(self, path: str, body: Any = None, missing_ok: bool = False) -> Any:
        try:
            return json.loads(self._open(path, body))
        except urllib.error.HTTPError as err:
            if missing_ok and err.code == 404:
                return None
            raise SystemExit(f"{path}: HTTP {err.code} {err.reason}") from err

    def image(self, scan_id: str, rel_path: str) -> bytes:
        return self._open("/image?" + urllib.parse.urlencode({"path": rel_path, "scan_id": scan_id}))


def read_json(path: str | None) -> Any:
    return None if path is None else json.loads(Path(path).read_text())


def strip_ns(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text)).strip()


def parse_xmp(xml: str) -> tuple[list[str], str]:
    """Keywords and description, the way web/src/lib/captionStore.ts reads them."""
    keywords: list[str] = []
    subject = re.search(r"<dc:subject>([\s\S]*?)</dc:subject>", xml, re.I)
    if subject:
        keywords = [word for word in (strip_ns(item) for item in re.findall(r"<rdf:li[^>]*>([\s\S]*?)</rdf:li>", subject.group(1), re.I)) if word]
    description = ""
    desc = re.search(r"<dc:description>([\s\S]*?)</dc:description>", xml, re.I)
    if desc:
        first = re.search(r"<rdf:li[^>]*>([\s\S]*?)</rdf:li>", desc.group(1), re.I)
        description = strip_ns(first.group(1) if first else desc.group(1))
    return keywords, description


def read_caption(images: Path, rel_path: str) -> dict | None:
    stem = (images / rel_path).with_suffix("")
    txt = stem.with_suffix(".txt")
    xmp = stem.with_suffix(".xmp")
    text = txt.read_text(errors="replace")[:65536].strip() if txt.is_file() else ""
    keywords, description = parse_xmp(xmp.read_text(errors="replace")[:65536]) if xmp.is_file() else ([], "")
    if not txt.is_file() and not xmp.is_file():
        return None
    return {"text": "\n".join(part for part in (text, description) if part), "keywords": keywords}


# ---------------------------------------------------------------- shaping


def scrubber(root: str | None, folder: str) -> tuple[str, Callable[[Any], Any]]:
    """The folder under /data/images, and a function that rewrites host paths in any JSON value."""
    root = (root or "").rstrip("/")
    folder = folder.rstrip("/")
    if root and (folder == root or folder.startswith(root + "/")):
        rel = folder[len(root) :].strip("/")
    else:
        rel = Path(folder).name
    new_folder = f"{SOURCE}/{rel}" if rel else SOURCE
    swaps = sorted({(folder, new_folder), *(((root, SOURCE),) if root else ())}, key=lambda pair: -len(pair[0]))

    def scrub(value: Any) -> Any:
        if isinstance(value, str):
            for old, new in swaps:
                if old and old != new:
                    value = value.replace(old, new)
            return value
        if isinstance(value, list):
            return [scrub(item) for item in value]
        if isinstance(value, dict):
            return {key: scrub(item) for key, item in value.items()}
        return value

    return new_folder, scrub


def public_health(health: dict | None) -> dict:
    """/health as the demo shows it: no URLs or hosts, paths under the container mounts."""
    out = {key: value for key, value in (health or {}).items() if not re.search(r"url|host|addr", key, re.I)}
    out["status"] = out.get("status", "ok")
    out["source_root"] = SOURCE
    out["export_root"] = EXPORT if out.get("export_root") else None
    return out


def split_detail(result: dict) -> tuple[dict, dict]:
    """The grid's copy of a result, and the fields only the detail view reads."""
    slim = json.loads(json.dumps(result))
    detail: dict[str, Any] = {}
    if "score_breakdown" in slim:
        detail["score_breakdown"] = slim.pop("score_breakdown")
    for key in ("nsfw", "erax"):
        block = slim.get(key)
        if isinstance(block, dict) and block.get("detections"):
            detail.setdefault(key, {})["detections"] = block["detections"]
            block["detections"] = []
    return slim, detail


def run_stats(summary: dict, select: dict | None) -> dict:
    results = summary.get("results", [])
    reasons = Counter(image.get("reject_reason") or "unknown" for image in results if not image.get("passed", True))
    flagged: Counter[str] = Counter()
    for image in results:
        guard = image.get("guard")
        if guard and guard.get("safe") is False:
            flagged[guard.get("policy") or (summary.get("guard_config") or {}).get("policy") or "official"] += 1
        for name, verdict in (image.get("guard_variants") or {}).items():
            if verdict and verdict.get("safe") is False:
                flagged[name] += 1
    return {
        "total": summary.get("total", len(results)),
        "passed": summary.get("passed"),
        "rejected": summary.get("rejected"),
        "duplicates": summary.get("duplicates"),
        "reject_reasons": dict(sorted(reasons.items())),
        "kept": select.get("kept") if select else None,
        "faces": sum(1 for image in results if image.get("face_count")),
        "nudenet_checked": sum(1 for image in results if image.get("nsfw") is not None),
        "flagged_by_policy": dict(sorted(flagged.items())),
    }


def select_from_scan(summary: dict) -> dict:
    """Without a curator to ask: the keep reasons the scan recorded, which are its default filters."""
    rows = [{"rel_path": image["rel_path"], "abs_path": image["abs_path"], "keep_reason": image.get("keep_reason", "")} for image in summary["results"]]
    return {"scan_id": summary["scan_id"], "total": len(rows), "kept": sum(1 for row in rows if row["keep_reason"] == ""), "rows": rows}


def encode(data: bytes, longest: int, quality: int) -> bytes:
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        image.thumbnail((longest, longest))
        out = io.BytesIO()
        # No EXIF or XMP is carried over: a photo's metadata can name its camera, place and owner.
        image.save(out, "WEBP", quality=quality, method=6)
        return out.getvalue()


def check_leaks(out: Path) -> None:
    for path in sorted([*out.rglob("*.json"), *out.rglob("*.md")]):
        found = LEAKS.search(path.read_text())
        if found:
            raise SystemExit(f"{path.relative_to(out)} still names {found.group(0)!r}; scrub it before publishing the tape")


# ---------------------------------------------------------------- main


def record(args: argparse.Namespace) -> None:
    out = Path(args.out or os.environ.get("CULL_TAPE_DIR") or DEFAULT_OUT).resolve()
    images_dir = Path(args.images).resolve() if args.images else None
    if args.mode == "live":
        curator = Curator(args.curator)
        health = curator.json("/health")
        detectors = curator.json("/detectors")
        policies = curator.json("/guard/policies", missing_ok=True)
        scan_id = args.scan_id
        if not scan_id:
            listed = curator.json("/scans", missing_ok=True) or {}
            rows = [row for row in listed.get("scans", []) if row.get("scan_id") != (listed.get("active") or {}).get("scan_id")]
            if not rows:
                raise SystemExit("the curator holds no finished scan; scan a folder first or pass --scan-id")
            scan_id = max(rows, key=lambda row: row.get("updated_at", ""))["scan_id"]
        summary = curator.json(f"/scan/{urllib.parse.quote(scan_id)}")
        select = curator.json(f"/scan/{urllib.parse.quote(scan_id)}/select", DEFAULT_SELECT)
        fetch: Callable[[str], bytes] = lambda rel: curator.image(scan_id, rel)  # noqa: E731
        source = "curator"
        root = health.get("source_root")
        curator_version = health.get("version")
    else:
        if images_dir is None:
            raise SystemExit("saved: --images names the folder the scan read")
        summary = read_json(args.scan)
        health = read_json(args.health) or {}
        detectors = read_json(args.detectors) or {}
        policies = read_json(args.policies)
        select = read_json(args.select) or select_from_scan(summary)
        fetch = lambda rel: (images_dir / rel).read_bytes()  # noqa: E731
        source = "saved-scan"
        root = args.source_root or health.get("source_root")
        curator_version = args.curator_version or health.get("version")

    folder, scrub = scrubber(root, summary["folder"])
    summary = scrub(summary)
    summary["folder"] = folder
    for image in summary["results"]:
        image["abs_path"] = f"{folder}/{image['rel_path']}"
    select = scrub(select)
    for row in select["rows"]:
        row["abs_path"] = f"{folder}/{row['rel_path']}"
    policies = scrub(policies)

    captions: dict[str, Any] = {}
    given = read_json(args.captions) or {}
    for image in summary["results"]:
        rel = image["rel_path"]
        caption = given.get(rel) if rel in given else (read_caption(images_dir, rel) if images_dir else None)
        captions[image["abs_path"]] = caption

    labels_in = read_json(args.labels) or {}
    labels = {"folder": folder, "labels": labels_in.get("labels", {})}
    cohorts = json.loads(Path(args.cohorts or ROOT / "cohorts.json").read_text())
    about = read_json(args.about)
    if about is not None and not (isinstance(about, list) and all(isinstance(row, dict) and {"label", "text"} <= row.keys() for row in about)):
        raise SystemExit("--about must be a JSON list of {label, text}")
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    if out.exists():
        shutil.rmtree(out)
    for sub in ("thumbs", "images", "detail"):
        (out / sub).mkdir(parents=True)

    files: dict[str, str] = {}
    slim_results = []
    for image in summary["results"]:
        rel = image["rel_path"]
        ident = file_id(rel)
        files[rel] = ident
        slim, detail = split_detail(image)
        slim_results.append(slim)
        (out / "detail" / f"{ident}.json").write_text(json.dumps(detail, separators=(",", ":")))
        data = fetch(rel)
        (out / "thumbs" / f"{ident}.webp").write_bytes(encode(data, THUMB_PX, 72))
        (out / "images" / f"{ident}.webp").write_bytes(encode(data, IMAGE_PX, 80))
        print(f"  {rel}", file=sys.stderr)

    blur = os.environ.get("ARGUS_CULL_BLUR_EXPOSED_SCORE", "").strip()
    policy_blur = os.environ.get("ARGUS_CULL_POLICY_BLUR", "1").strip().lower() not in ("0", "false", "off", "no", "")
    tape = {
        "format": FORMAT,
        "version": VERSION,
        "generated_at": now,
        "provenance": {
            "kind": "sample" if args.sample else "recorded",
            "source": source,
            "curator": {"version": curator_version, "commit": args.curator_commit},
            "note": args.note,
            # Short label/text lines for About this tape, and the full provenance beside the tape.
            "about": about,
            "document": "PROVENANCE.md" if args.provenance_doc else None,
        },
        "scan_config": {key: summary[key] for key in CONFIG_KEYS if key in summary},
        "stats": run_stats(summary, select),
        "health": public_health(health),
        "detectors": detectors,
        "guard_policies": policies,
        "display": {"exposedScore": float(blur) if blur else 0.25, "policyBlur": policy_blur},
        "scans": {"active": None, "scans": [{"scan_id": summary["scan_id"], "folder": folder, "total": summary.get("total", len(slim_results)), "updated_at": now}]},
        "select": {"request": DEFAULT_SELECT, "result": select},
        "files": files,
    }
    write = lambda name, body: (out / name).write_text(json.dumps(body, indent=1 if name == "tape.json" else None, separators=None if name == "tape.json" else (",", ":")) + "\n")  # noqa: E731
    write("tape.json", tape)
    write("scan.json", {**summary, "results": slim_results})
    write("cohorts.json", cohorts)
    write("captions.json", captions)
    write("labels.json", labels)
    if args.run_stats:
        write("run_stats.json", scrub(read_json(args.run_stats)))
    if args.provenance_doc:
        shutil.copyfile(args.provenance_doc, out / "PROVENANCE.md")
    check_leaks(out)
    print(f"tape: {len(files)} images, {tape['provenance']['kind']}, curator {curator_version or 'unknown'} -> {out}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="mode", required=True)
    for name in ("live", "saved"):
        p = sub.add_parser(name)
        p.add_argument("--out", help="tape folder (default $CULL_TAPE_DIR or web/public/data-tape)")
        p.add_argument("--images", help="the scanned folder: caption sidecars (both modes) and the images (saved)")
        p.add_argument("--labels", help="the page's labels file for this folder (CULL_LABELS_PATH/<folder>-<digest>.json)")
        p.add_argument("--captions", help="captions JSON by rel_path, instead of reading sidecars")
        p.add_argument("--cohorts", help="cohort rules (default: the repo's cohorts.json)")
        p.add_argument("--run-stats", help="a Run stats download of the same scan, kept beside the tape")
        p.add_argument("--curator-commit", help="the curator commit, when known")
        p.add_argument("--note", default=None, help="one line on what the set is, shown on the page")
        p.add_argument("--about", help="JSON list of {label, text}: what the set is, for the sidebar's About this tape")
        p.add_argument("--provenance-doc", help="a public provenance document (Markdown), copied beside the tape as PROVENANCE.md")
        p.add_argument("--sample", action="store_true", help="hand-written or synthetic results: the page says Sample data, not Recorded")
    live = sub.choices["live"]
    live.add_argument("--curator", default="http://localhost:8101")
    live.add_argument("--scan-id")
    saved = sub.choices["saved"]
    saved.add_argument("--scan", required=True, help="GET /scan/{id} saved as JSON")
    saved.add_argument("--health")
    saved.add_argument("--detectors")
    saved.add_argument("--policies", help="GET /guard/policies saved as JSON")
    saved.add_argument("--select", help="POST /scan/{id}/select with the default body, saved as JSON")
    saved.add_argument("--source-root", help="the curator's source root, when --health does not say")
    saved.add_argument("--curator-version")
    record(parser.parse_args())


if __name__ == "__main__":
    main()
