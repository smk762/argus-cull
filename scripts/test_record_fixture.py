import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import argus_curator  # noqa: F401
except ImportError:  # the recording needs curator; these tests only need its names
    curator = types.ModuleType("argus_curator")
    curator.__version__ = "0.0.0"
    scanner = types.ModuleType("argus_curator.scanner")
    scanner.scan_folder = lambda folder: None
    curator.scanner = scanner
    sys.modules["argus_curator"] = curator
    sys.modules["argus_curator.scanner"] = scanner

import compose_pin  # noqa: E402
import record_fixture  # noqa: E402

COMPOSE = """services:
  curator:
    image: argus-curator:dev-aaaaaaaaa
    build:
      context: https://github.com/smk762/argus-curator.git#aaaaaaaaaaaaaaaa
      args:
        VERSION: 0.1.0
"""
NEW = "bbbbbbbbbbbbbbbb"


class CommitRecordTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.record, self.sync, self.compose = root / "fixture-scan.json", root / "argus-curator.json", root / "docker-compose.yaml"
        self.record.write_text('{"curator": {"version": "0.1.0", "commit": "aaaaaaaaaaaaaaaa"}, "scan": {}}\n')
        self.sync.write_text('{"commit": "aaaaaaaaaaaaaaaa", "version": "0.1.0"}\n')
        self.compose.write_text(COMPOSE)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def files(self) -> list[str]:
        return [path.read_text() for path in (self.record, self.sync, self.compose)]

    def test_a_malformed_sync_record_leaves_the_fixture_record_as_it_was(self) -> None:
        self.sync.write_text("{not json")
        before = self.files()
        argv = ["record_fixture.py", "--commit", NEW]
        with mock.patch.object(record_fixture, "RECORD", self.record), mock.patch.object(record_fixture, "SYNC", self.sync), mock.patch.object(
            compose_pin, "COMPOSE", self.compose
        ), mock.patch.object(compose_pin, "write", side_effect=AssertionError("must not touch the real compose file")), mock.patch.object(
            record_fixture, "scan", return_value={"total": 1}
        ), mock.patch.object(sys, "argv", argv):
            with self.assertRaises(json.JSONDecodeError):
                record_fixture.main()
        self.assertEqual(self.files(), before)

    def test_a_compose_file_without_its_pin_leaves_all_three_as_they_were(self) -> None:
        self.compose.write_text("services: {}\n")
        before = self.files()
        with self.assertRaises(ValueError):
            record_fixture.commit_record(NEW, "0.2.0", {"total": 1}, self.record, self.sync, self.compose)
        self.assertEqual(self.files(), before)
        self.assertEqual(sorted(p.name for p in self.record.parent.iterdir()), ["argus-curator.json", "docker-compose.yaml", "fixture-scan.json"])

    def test_the_three_move_together(self) -> None:
        record_fixture.commit_record(NEW, "0.2.0", {"total": 1}, self.record, self.sync, self.compose)
        self.assertEqual(json.loads(self.record.read_text())["curator"], {"version": "0.2.0", "commit": NEW})
        self.assertEqual(json.loads(self.sync.read_text()), {"commit": NEW, "version": "0.2.0"})
        self.assertEqual(compose_pin.problems(NEW, "0.2.0", self.compose), [])


if __name__ == "__main__":
    unittest.main()
