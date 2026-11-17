import base64
import io
import unittest
from unittest import mock

from PIL import Image, ImageFile

from inputs import PINNED_REVISIONS, decode_image, model_revision

SHA = "0123456789abcdef0123456789abcdef01234567"


def _png(size: tuple[int, int]) -> str:
    out = io.BytesIO()
    Image.new("1", size).save(out, "PNG")
    return base64.b64encode(out.getvalue()).decode()


class ModelRevisionTest(unittest.TestCase):
    def test_the_default_model_loads_at_its_pin(self) -> None:
        self.assertEqual(model_revision("inclusionAI/Sing-Guard-4b", None), PINNED_REVISIONS["inclusionAI/Sing-Guard-4b"])
        self.assertEqual(model_revision("inclusionAI/Sing-Guard-4b", "  "), PINNED_REVISIONS["inclusionAI/Sing-Guard-4b"])

    def test_an_unpinned_model_refuses_to_start(self) -> None:
        with self.assertRaises(SystemExit):
            model_revision("someone/remote-code-model", None)

    def test_a_branch_or_tag_is_not_a_pin(self) -> None:
        for moving in ("main", "v1.0", SHA[:12]):
            with self.assertRaises(SystemExit, msg=moving):
                model_revision("inclusionAI/Sing-Guard-4b", moving)

    def test_a_full_sha_is_used(self) -> None:
        self.assertEqual(model_revision("someone/remote-code-model", SHA), SHA)


class DecodeImageTest(unittest.TestCase):
    def test_a_small_image_decodes(self) -> None:
        self.assertEqual(decode_image(_png((8, 6))).size, (8, 6))

    def test_an_image_over_the_pixel_cap_is_refused_before_it_is_decoded(self) -> None:
        with mock.patch.object(ImageFile.ImageFile, "load") as load, self.assertRaises(ValueError):
            decode_image(_png((20, 20)), max_pixels=399)
        load.assert_not_called()

    def test_a_decompression_bomb_is_a_value_error_not_a_500(self) -> None:
        # Over twice Pillow's limit, Image.open raises DecompressionBombError itself.
        with mock.patch.object(Image, "MAX_IMAGE_PIXELS", 10), self.assertRaises(ValueError):
            decode_image(_png((20, 20)))

    def test_a_bomb_warning_is_refused_too(self) -> None:
        # Between Pillow's limit and twice it, Pillow only warns.
        with mock.patch.object(Image, "MAX_IMAGE_PIXELS", 300), self.assertRaises(ValueError):
            decode_image(_png((20, 20)))

    def test_oversized_base64_is_refused_without_decoding(self) -> None:
        with (
            mock.patch("inputs.MAX_ENCODED_CHARS", 8),
            mock.patch("inputs.base64.b64decode") as decode,
            self.assertRaises(ValueError),
        ):
            decode_image(_png((8, 6)))
        decode.assert_not_called()

    def test_not_an_image_is_a_value_error(self) -> None:
        for text in ("not base64!", base64.b64encode(b"plain text").decode()):
            with self.assertRaises(ValueError, msg=text):
                decode_image(text)


if __name__ == "__main__":
    unittest.main()
