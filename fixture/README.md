# Synthetic fixture

These PNGs are drawn shapes, not photographs of people. They exist so a scan can run without a GPU and without model weights.

A CPU scan scores sharpness and near-duplicates only. The face, room, sky, and garment pictures are here so a later scan with InsightFace, Places365, and Fashionpedia has something obvious to look at. They are not labels the CPU scan is expected to detect.

`rejects/blurry.png` is a blurred copy of the duplicate pattern and should fail the blur check. `duplicates/original.png` and `duplicates/copy.png` are the same picture and should form one near-duplicate pair.

Regenerate with `python scripts/make_fixture.py`. Do not replace this folder with real portraits or with sexual images.
