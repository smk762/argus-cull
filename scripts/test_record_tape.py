import argparse
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import record_tape  # noqa: E402


def _args(**overrides: object) -> argparse.Namespace:
    base: dict[str, object] = {
        "mode": "saved",
        "out": None,
        "images": None,
        "labels": None,
        "captions": None,
        "cohorts": None,
        "run_stats": None,
        "curator_commit": None,
        "note": None,
        "about": None,
        "provenance_doc": None,
        "sample": True,
        "scan": None,
        "health": None,
        "detectors": None,
        "policies": None,
        "select": None,
        "source_root": None,
        "curator_version": None,
    }
    base.update(overrides)
    return argparse.Namespace(**base)


class ReadCaptionTest(unittest.TestCase):
    def test_a_dotted_name_reads_its_own_sidecar(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            images = Path(tmp)
            (images / "portrait.v2.txt").write_text("the v2 caption")
            (images / "portrait.txt").write_text("someone else's caption")
            caption = record_tape.read_caption(images, "portrait.v2.jpg")
        self.assertEqual(caption, {"text": "the v2 caption", "keywords": []})

    def test_a_dotted_name_does_not_borrow_another_images_sidecar(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            images = Path(tmp)
            (images / "portrait.txt").write_text("portrait.jpg's caption")
            self.assertIsNone(record_tape.read_caption(images, "portrait.v1.jpg"))


class SelectFromScanTest(unittest.TestCase):
    def test_an_empty_keep_reason_is_kept(self) -> None:
        summary = {
            "scan_id": "s",
            "results": [
                {"rel_path": "a.jpg", "abs_path": "/x/a.jpg", "keep_reason": ""},
                {"rel_path": "b.jpg", "abs_path": "/x/b.jpg", "keep_reason": "below-score"},
            ],
        }
        self.assertEqual(record_tape.select_from_scan(summary)["kept"], 1)

    def test_a_missing_keep_reason_is_not_counted_as_kept(self) -> None:
        summary = {"scan_id": "s", "results": [{"rel_path": "a.jpg", "abs_path": "/x/a.jpg"}]}
        select = record_tape.select_from_scan(summary)
        self.assertEqual(select["kept"], 0)
        self.assertNotEqual(select["rows"][0]["keep_reason"], "")


class RecordTest(unittest.TestCase):
    def test_a_failed_fetch_leaves_the_previous_tape_in_place(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "tape"
            out.mkdir()
            (out / "tape.json").write_text('{"previous": true}\n')
            images = root / "images"
            images.mkdir()
            scan = root / "scan.json"
            # The image the scan names is not in --images, so its fetch fails.
            scan.write_text(json.dumps({
                "scan_id": "s",
                "folder": str(images),
                "results": [{"rel_path": "gone.jpg", "abs_path": str(images / "gone.jpg"), "keep_reason": ""}],
            }))
            with self.assertRaises(FileNotFoundError):
                record_tape.record(_args(out=str(out), images=str(images), scan=str(scan)))
            self.assertEqual(json.loads((out / "tape.json").read_text()), {"previous": True})
            self.assertEqual(sorted(path.name for path in root.iterdir()), ["images", "scan.json", "tape"])


if __name__ == "__main__":
    unittest.main()
