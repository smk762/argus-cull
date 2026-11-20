"""Write a *sample* scan of ``fixture/`` for the static demo while the real demo set is pending.

    python scripts/make_sample_scan.py            # writes tape/sample/*.json
    python scripts/record_tape.py saved --sample --scan tape/sample/scan.json --images fixture ...

The fixture is drawn shapes, so a real scan finds no faces, nudity or policy
verdicts in it. The detector fields here are hand-written to exercise every
part of the page (blur until scored, a policy split, a reject, a duplicate,
cohort tags, labels) and the tape built from them is marked ``sample``: the
page shows the "Sample data" badge, never "Recorded". Replace it with a tape
recorded from a real curator (``record_tape.py live``) for the hosted demo.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tape" / "sample"
FOLDER = "/data/images/fixture"
SCAN_ID = "sample0fixture01"
NOTE = "Sample verdict, hand-written for the layout: the fixture is drawn shapes and no model judged it."
MODEL = "sample (no model ran)"


def face(age: float, pose: str, conf: float = 0.91) -> dict:
    attrs = {
        "gender": "female",
        "gender_conf": 0.88,
        "gender_source": "mivolo",
        "age": "20-29" if age < 30 else "30-39",
        "age_conf": conf,
        "age_years": age,
        "age_source": "mivolo",
    }
    return {"attrs": attrs, "pose": pose}


def nsfw(**labels: float) -> dict:
    exposed = max([score for label, score in labels.items() if label.endswith("_EXPOSED") and not label.startswith(("FEET", "MALE_BREAST", "ARMPITS", "BELLY"))] or [0.0])
    return {
        "detections": [{"label": label, "score": score, "bbox": [180, 220, 240, 260]} for label, score in labels.items()],
        "labels": labels,
        "exposed_score": exposed,
    }


def guard(policy: str, safe: bool, rules: list[str] | None = None, why: str = "") -> dict:
    return {
        "safe": safe,
        "rules": rules or [],
        "explanation": f"{why} {NOTE}".strip(),
        "model": MODEL,
        "policy": policy,
    }


def result(rel: str, score: float, **extra) -> dict:
    base = {
        "rel_path": rel,
        "abs_path": f"{FOLDER}/{rel}",
        "score": score,
        "passed": True,
        "reject_reason": None,
        "similar_group": -1,
        "group_size": 1,
        "is_representative": True,
        "is_duplicate": False,
        "duplicate_of": None,
        "keep_reason": "",
        "sharpness": round(120 + score * 300, 1),
        "artifact_score": 0.04,
        "score_breakdown": {"sharpness": round(score * 0.6, 3), "resolution": 0.2, "artifact": 0.08, "target_bonus": 0.0, "face_penalty": 0.0},
        "width": 768,
        "height": 768,
        "face_count": 0,
        "faces": [],
        "primary_face_cluster": None,
        "primary_face_pose": None,
        "primary_face_attributes": None,
        "scene": None,
        "garments": [],
        "nsfw": nsfw(),
        "content_rating": "safe",
        "guard": guard("adult", True, why="No rule applies."),
        "guard_variants": {"strict": guard("strict", True, why="No rule applies.")},
    }
    person = extra.pop("person", None)
    if person:
        base.update(
            face_count=1,
            faces=[{"primary": True, "attributes": person["attrs"]}],
            primary_face_cluster="face_1",
            primary_face_pose=person["pose"],
            primary_face_attributes=person["attrs"],
        )
    base.update(extra)
    return base


def scene(label: str, conf: float, environment: str) -> dict:
    return {"categories": [{"label": label, "conf": conf}], "environment": environment, "environment_conf": 0.9}


def main() -> None:
    results = [
        result("duplicates/original.png", 0.81, similar_group=0, group_size=2, scene=scene("art_studio", 0.31, "indoor")),
        result(
            "duplicates/copy.png",
            0.8,
            similar_group=0,
            group_size=2,
            is_representative=False,
            is_duplicate=True,
            duplicate_of="duplicates/original.png",
            keep_reason="similar-to:duplicates/original.png",
            scene=scene("art_studio", 0.3, "indoor"),
        ),
        result("faces/front.png", 0.86, person=face(29.4, "frontal"), scene=scene("studio_photography", 0.42, "indoor")),
        # Under the blur line once scored: the blur lifts when its reading lands.
        result(
            "faces/three-quarter.png",
            0.78,
            person=face(31.2, "three_quarter"),
            nsfw=nsfw(BUTTOCKS_EXPOSED=0.31, FACE_FEMALE=0.7),
            content_rating="explicit",
            scene=scene("bedroom", 0.38, "indoor"),
        ),
        # Over the line and a policy split: stays veiled, Unblur allowed.
        result(
            "faces/profile.png",
            0.74,
            person=face(27.8, "profile"),
            nsfw=nsfw(FEMALE_BREAST_EXPOSED=0.64, FACE_FEMALE=0.66),
            content_rating="explicit",
            scene=scene("bedroom", 0.33, "indoor"),
            guard=guard("adult", True, why="Consensual adult nudity passes under adult."),
            guard_variants={"strict": guard("strict", False, ["A"], why="Nudity is flagged under strict.")},
        ),
        # No face and nothing exposed, but both policies flag it: veiled by the verdict, Unblur allowed.
        result(
            "garments/dress.png",
            0.69,
            garments=[{"label": "dress", "conf": 0.88, "bbox": [230, 200, 310, 460], "touches_edge": False, "color": "red"}],
            nsfw=nsfw(FEMALE_BREAST_COVERED=0.41),
            content_rating="suggestive",
            guard=guard("adult", False, ["A"], why="The sample marks this frame unsafe to show a red shield."),
            guard_variants={"strict": guard("strict", False, ["A"], why="The sample marks this frame unsafe to show a red shield.")},
        ),
        result("garments/jacket.png", 0.72, garments=[{"label": "jacket", "conf": 0.79, "bbox": [210, 180, 350, 330], "touches_edge": False, "color": "blue"}]),
        result(
            "rejects/blurry.png",
            0.21,
            passed=False,
            reject_reason="blur",
            keep_reason="rejected",
            nsfw=None,
            content_rating=None,
            guard=None,
            guard_variants={},
            score_breakdown={"sharpness": 0.02, "resolution": 0.2, "artifact": 0.0, "target_bonus": 0.0, "face_penalty": 0.0},
        ),
        result("scenes/room.png", 0.66, scene=scene("library/indoor", 0.46, "indoor")),
        result("scenes/sky.png", 0.55, keep_reason="below-score", scene=scene("sky", 0.71, "outdoor")),
    ]
    passed = [image for image in results if image["passed"]]
    attrs = results[2]["primary_face_attributes"]
    summary = {
        "scan_id": SCAN_ID,
        "folder": FOLDER,
        "faces_config": {"enabled": True, "fairface": False, "mivolo": True},
        "scenes_config": {"enabled": True},
        "garments_config": {"enabled": True, "min_conf": 0.3},
        "nsfw_config": {"enabled": True},
        "erax_config": {"enabled": False},
        "guard_config": {"enabled": True, "policy": "adult", "variants": ["strict"]},
        "total": len(results),
        "passed": len(passed),
        "rejected": len(results) - len(passed),
        "duplicates": sum(1 for image in passed if image["is_duplicate"]),
        "face_clusters": [
            {"cluster_id": "face_1", "size": 3, "representative_rel_path": "faces/front.png", "representative_bbox": [200, 120, 360, 520], "attributes": attrs}
        ],
        "results": results,
    }
    health = {
        "status": "ok",
        "service": "argus-curator",
        "version": "sample",
        "manifest_version": "1",
        "source_root": "/data/images",
        "export_root": "/data/out",
        "allow_move": False,
        "guard_policy_text": True,
    }
    detectors = {
        "torch": False, "cuda": False, "clip": False, "insightface": True, "onnxruntime": True, "fairface": False,
        "mivolo": True, "places365": True, "garments": True, "bodies": False, "nudenet": True, "erax": False,
        "watermark": False, "singguard": True, "singguard_policies": ["adult", "strict"],
    }
    wording = "Sample wording for the layout. A recorded tape carries the policy text the curator served."
    policies = {
        "singguard": True,
        "policies": [
            {"name": "adult", "recorded": "adult", "source": "builtin", "text": wording, "error": None},
            {"name": "strict", "recorded": "strict", "source": "builtin", "text": wording, "error": None},
        ],
    }
    select = {
        "scan_id": SCAN_ID,
        "total": len(results),
        "kept": sum(1 for image in results if image["keep_reason"] == ""),
        "rows": [{"rel_path": image["rel_path"], "abs_path": image["abs_path"], "keep_reason": image["keep_reason"]} for image in results],
    }
    captions = {"garments/jacket.png": {"text": "A blue jacket over a backpack strap, drawn shapes on a light ground.", "keywords": ["jacket", "backpack"]}}
    labels = {
        "folder": FOLDER,
        "labels": {
            "faces/profile.png": {"expect": "adult", "proxy": False, "override": None, "note": "Sample label.", "updated_at": "2026-11-14T00:00:00Z"},
            "garments/dress.png": {"expect": "safe", "proxy": False, "override": None, "updated_at": "2026-11-14T00:00:00Z"},
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    files = {"scan": summary, "health": health, "detectors": detectors, "policies": policies, "select": select, "captions": captions, "labels": labels}
    for name, body in files.items():
        (OUT / f"{name}.json").write_text(json.dumps(body, indent=2) + "\n")
    print(f"wrote {len(files)} sample files to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
