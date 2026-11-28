import argparse
import importlib.util
import io
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

    def test_a_tape_left_as_old_by_an_interrupted_swap_is_restored_not_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "tape"
            # A run died after renaming tape -> tape.old and before tape.tmp -> tape.
            (root / "tape.old").mkdir()
            (root / "tape.old" / "tape.json").write_text('{"previous": true}\n')
            images = root / "images"
            images.mkdir()
            scan = root / "scan.json"
            scan.write_text(json.dumps({
                "scan_id": "s",
                "folder": str(images),
                "results": [{"rel_path": "gone.jpg", "abs_path": str(images / "gone.jpg"), "keep_reason": ""}],
            }))
            with self.assertRaises(FileNotFoundError):
                record_tape.record(_args(out=str(out), images=str(images), scan=str(scan)))
            self.assertEqual(json.loads((out / "tape.json").read_text()), {"previous": True})
            self.assertEqual(sorted(path.name for path in root.iterdir()), ["images", "scan.json", "tape"])

    def test_a_rel_path_outside_the_images_folder_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            images = root / "images"
            images.mkdir()
            (root / "secret.jpg").write_bytes(b"not for the tape")
            out = root / "tape"
            for rel in ("../secret.jpg", str(root / "secret.jpg")):
                scan = root / "scan.json"
                scan.write_text(json.dumps({
                    "scan_id": "s",
                    "folder": str(images),
                    "results": [{"rel_path": rel, "abs_path": str(images / rel), "keep_reason": ""}],
                }))
                with self.assertRaisesRegex(SystemExit, "leaves --images"):
                    record_tape.record(_args(out=str(out), images=str(images), scan=str(scan)))
                self.assertFalse(out.exists())


def _png(image: "object", **params: object) -> bytes:
    out = io.BytesIO()
    image.save(out, "PNG", **params)
    return out.getvalue()


class ScrubberTest(unittest.TestCase):
    def test_a_root_that_prefixes_the_source_mount_is_swapped_once(self) -> None:
        folder, scrub = record_tape.scrubber("/data", "/data/x")
        self.assertEqual(folder, "/data/images/x")
        self.assertEqual(scrub({"abs_path": "/data/x/a.jpg", "other": "/data/y/b.jpg"}), {"abs_path": "/data/images/x/a.jpg", "other": "/data/images/y/b.jpg"})

    def test_a_path_already_under_the_mount_is_left_alone(self) -> None:
        _, scrub = record_tape.scrubber("/home/someone/pics", "/home/someone/pics/set")
        self.assertEqual(scrub("/home/someone/pics/set/a.jpg"), "/data/images/set/a.jpg")
        self.assertEqual(scrub("/data/images/set/a.jpg"), "/data/images/set/a.jpg")

    def test_only_whole_path_components_are_swapped(self) -> None:
        _, scrub = record_tape.scrubber("/data", "/data/x")
        self.assertEqual(scrub("/database/y"), "/database/y")
        self.assertEqual(scrub("http://host/data/y"), "http://host/data/y")
        self.assertEqual(scrub('see "/data/y"'), 'see "/data/images/y"')
        _, scrub = record_tape.scrubber(None, "/home/someone/pics")
        self.assertEqual(scrub("/home/someone/pics2/a.jpg"), "/home/someone/pics2/a.jpg")
        self.assertEqual(scrub("/home/someone/pics"), "/data/images/pics")

    def test_keys_are_scrubbed_too(self) -> None:
        _, scrub = record_tape.scrubber(None, "/home/someone/pics")
        self.assertEqual(scrub({"/home/someone/pics/a.jpg": {"/home/someone/pics/b.jpg": 1}, 2: "x"}), {"/data/images/pics/a.jpg": {"/data/images/pics/b.jpg": 1}, 2: "x"})


class PublicHealthTest(unittest.TestCase):
    def test_endpoints_are_dropped_at_any_depth_and_under_any_name(self) -> None:
        health = {
            "status": "ok",
            "faces": True,
            "version": "0.15.1",
            "ai_backend": "http://10.0.0.5:11434",
            "qdrant": {"endpoint": "qdrant:6333", "ok": True},
            "backends": {"lens": {"url": "http://lens:8102", "ready": True}, "retina": "retina.internal:8000"},
            "peers": ["https://a.example/x", "kept"],
            "uptime": "12:30",
        }
        out = record_tape.public_health(health)
        self.assertEqual(out["qdrant"], {"ok": True})
        self.assertEqual(out["backends"], {"lens": {"ready": True}})
        self.assertEqual(out["peers"], ["kept"])
        self.assertNotIn("ai_backend", out)
        self.assertEqual((out["faces"], out["version"], out["uptime"]), (True, "0.15.1", "12:30"))
        self.assertNotRegex(json.dumps(out), r"://|:\d{4}")


NEEDS_PILLOW = unittest.skipUnless(importlib.util.find_spec("PIL"), "needs Pillow")


@NEEDS_PILLOW
class EncodeTest(unittest.TestCase):
    def test_a_palette_image_keeps_its_transparency(self) -> None:
        from PIL import Image

        image = Image.new("P", (8, 8), 0)
        image.putpalette([0, 0, 0, 255, 0, 0] + [0] * 762)
        image.putpixel((0, 0), 1)
        with Image.open(io.BytesIO(record_tape.encode(_png(image, transparency=0), 480, 80))) as out:
            self.assertEqual(out.mode, "RGBA")
            self.assertEqual(out.getpixel((4, 4))[3], 0)

    def test_an_rgb_image_with_a_transparency_key_keeps_it(self) -> None:
        from PIL import Image

        image = Image.new("RGB", (8, 8), (0, 0, 0))
        with Image.open(io.BytesIO(record_tape.encode(_png(image, transparency=(0, 0, 0)), 480, 80))) as out:
            self.assertEqual(out.mode, "RGBA")
            self.assertEqual(out.getpixel((4, 4))[3], 0)

    def test_a_grayscale_image_with_a_transparency_key_keeps_it(self) -> None:
        from PIL import Image

        image = Image.new("L", (8, 8), 0)
        with Image.open(io.BytesIO(record_tape.encode(_png(image, transparency=0), 480, 80))) as out:
            self.assertEqual(out.mode, "RGBA")
            self.assertEqual(out.getpixel((4, 4))[3], 0)


@NEEDS_PILLOW
class VeilTest(unittest.TestCase):
    def test_a_frame_under_the_cell_count_is_never_enlarged(self) -> None:
        from PIL import Image

        for size in ((10, 6), (28, 28)):
            with Image.open(io.BytesIO(record_tape.veil(_png(Image.new("RGB", size, (90, 40, 20))), 28))) as out:
                self.assertEqual(out.size, size)

    def test_a_large_frame_is_cut_to_the_cell_count(self) -> None:
        from PIL import Image

        with Image.open(io.BytesIO(record_tape.veil(_png(Image.new("RGB", (800, 400))), 28))) as out:
            self.assertEqual(out.size, (28, 14))


if __name__ == "__main__":
    unittest.main()
