"""Draw the committed fixture. Shapes only: not photographs, and not people.

Run from the repo root: python scripts/make_fixture.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "fixture"
SIZE = 768


def canvas(color: tuple[int, int, int]) -> Image.Image:
    return Image.new("RGB", (SIZE, SIZE), color)


def save(image: Image.Image, rel: str) -> None:
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")


def face(shift: int, profile: bool) -> Image.Image:
    image = canvas((24, 28, 40))
    draw = ImageDraw.Draw(image)
    draw.ellipse((200 + shift, 120, 560 + shift, 640), fill=(214, 176, 148))
    if profile:
        draw.rectangle((200 + shift, 120, 360 + shift, 640), fill=(24, 28, 40))
        draw.ellipse((390, 280, 460, 350), fill=(20, 20, 30))
    else:
        draw.ellipse((280 + shift, 270, 350 + shift, 340), fill=(20, 20, 30))
        draw.ellipse((430 + shift, 270, 500 + shift, 340), fill=(20, 20, 30))
        draw.arc((320 + shift, 400, 470 + shift, 520), 20, 160, fill=(140, 50, 60), width=10)
    return image


def main() -> None:
    save(face(0, False), "faces/front.png")
    save(face(-80, False), "faces/three-quarter.png")
    save(face(0, True), "faces/profile.png")

    room = canvas((70, 52, 36))
    draw = ImageDraw.Draw(room)
    draw.rectangle((0, 0, SIZE, 180), fill=(28, 32, 48))
    draw.rectangle((70, 40, 280, 200), fill=(150, 190, 220))
    draw.rectangle((0, 520, SIZE, SIZE), fill=(96, 72, 48))
    draw.rectangle((500, 280, 680, 520), fill=(36, 90, 48))
    save(room, "scenes/room.png")

    sky = canvas((118, 176, 224))
    draw = ImageDraw.Draw(sky)
    draw.ellipse((70, 60, 210, 200), fill=(250, 214, 70))
    draw.polygon([(0, 560), (220, 340), (420, 620)], fill=(34, 110, 48))
    draw.polygon([(280, 640), (540, 280), (760, 660)], fill=(24, 80, 40))
    save(sky, "scenes/sky.png")

    dress = canvas((236, 236, 236))
    draw = ImageDraw.Draw(dress)
    draw.ellipse((320, 70, 448, 198), fill=(214, 176, 148))
    draw.polygon([(384, 200), (230, 660), (538, 660)], fill=(176, 32, 78))
    save(dress, "garments/dress.png")

    jacket = canvas((236, 236, 236))
    draw = ImageDraw.Draw(jacket)
    draw.ellipse((320, 60, 448, 188), fill=(214, 176, 148))
    draw.rectangle((250, 190, 518, 540), fill=(22, 42, 110))
    draw.rectangle((160, 210, 250, 500), fill=(22, 42, 110))
    draw.rectangle((518, 210, 608, 500), fill=(22, 42, 110))
    save(jacket, "garments/jacket.png")

    duplicate = canvas((12, 12, 16))
    draw = ImageDraw.Draw(duplicate)
    for index in range(8):
        draw.rectangle((36 + index * 90, 36, 96 + index * 90, 720), fill=(240, 40 + index * 24, 48))
    draw.ellipse((180, 180, 580, 580), outline=(255, 255, 255), width=16)
    save(duplicate, "duplicates/original.png")
    save(duplicate.copy(), "duplicates/copy.png")
    save(duplicate.filter(ImageFilter.GaussianBlur(radius=18)), "rejects/blurry.png")


if __name__ == "__main__":
    main()
