import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import make_fixture  # noqa: E402
except ImportError as err:  # Pillow is a recording dependency, not a test one
    raise unittest.SkipTest(f"needs Pillow: {err}") from err

EYE = (20, 20, 30)


class FaceTest(unittest.TestCase):
    def test_a_shifted_profile_keeps_its_eye_on_the_face(self) -> None:
        for shift in (0, 60, 120):
            image = make_fixture.face(shift, True)
            # The eye's centre moves with the head, and lands on it.
            self.assertEqual(image.getpixel((425 + shift, 315)), EYE, f"shift {shift}")
            self.assertEqual(image.getpixel((425 + shift, 400)), (214, 176, 148), f"shift {shift}")


if __name__ == "__main__":
    unittest.main()
