"""compose_labels: the committed compose file passes, and a missing or wrong label is named."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import compose_labels  # noqa: E402


class ComposeLabels(unittest.TestCase):
    def test_the_committed_compose_file_labels_every_argus_service(self) -> None:
        self.assertEqual(compose_labels.problems(), [])
        blocks = compose_labels.services(compose_labels.COMPOSE.read_text())
        labelled = {name for name, block in blocks.items() if "argus.peer:" in block}
        self.assertEqual(labelled, {"argus-curator", "nudenet", "erax", "watermark", "singguard"})

    def test_a_missing_or_wrong_label_is_a_problem(self) -> None:
        text = compose_labels.COMPOSE.read_text()
        with tempfile.TemporaryDirectory() as tmp:
            bare = Path(tmp) / "bare.yaml"
            bare.write_text(text.replace("      argus.peer: erax\n", ""))
            self.assertTrue(any("erax needs the label argus.peer: erax" in p for p in compose_labels.problems(bare)))

            wrong = Path(tmp) / "wrong.yaml"
            wrong.write_text(
                text.replace('argus.port: "8101"', 'argus.port: "8102"').replace("- ARGUS_PEER=nudenet", "- ARGUS_PEER=nsfw")
            )
            found = compose_labels.problems(wrong)
            self.assertTrue(any("argus-curator needs the label argus.port: 8101" in p for p in found))
            self.assertTrue(any("nudenet needs ARGUS_PEER=nudenet" in p for p in found))

    def test_other_containers_are_not_argus_services(self) -> None:
        self.assertIsNone(compose_labels.expected("python:3.12-slim"))
        self.assertEqual(compose_labels.expected("ghcr.io/smk762/argus-retina-ocr:0.3.0")["argus.peer"], "ocr")
        self.assertEqual(compose_labels.expected("argus-curator:dev-abc")["argus.peer"], "curator")


if __name__ == "__main__":
    unittest.main()
