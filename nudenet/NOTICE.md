# Licence: the nudenet sidecar

`app.py` and `../sidecar-common/sidecar.py` are MIT, like the rest of argus-cull. The image this directory builds
combines them with [NudeNet](https://github.com/notAI-tech/NudeNet) 3.4.2, which is **AGPL-3.0**. So the built image is
an AGPL-3.0 work, and it is labelled that way (`org.opencontainers.image.licenses`).

| Part | Licence | Notes |
|---|---|---|
| `nudenet` 3.4.2 (PyPI) | AGPL-3.0 | The wheel ships the AGPL text as `LICENSE` and `LICENSE.md`. Its metadata still says MIT; that is a stale classifier. The repo has been AGPL since November 2023. |
| 640m weights (`640m.onnx`) | NudeNet's terms (treat as AGPL-3.0) | Fetched from a Hugging Face mirror (`zhangsongbo365/nudenet_onnx`) that labels them MIT. A re-upload can't relicense NudeNet's weights. |

What this means here:

- **Keep it behind HTTP.** Curator and every other Argus package call this sidecar over `POST /infer` and never import
  `nudenet`. argus-ci's `agpl-import` suite rule enforces that; the `nosemgrep` on the import in `app.py` exempts this
  sidecar alone.
- **The image is built locally and not published.** `release.yml` pushes only the web image.
- **Not in a public deployment without a source offer.** AGPL section 13 requires offering the source to anyone who
  uses the program over a network. Today the sidecar runs only beside a local curator. The public demo replays a
  recorded tape and runs no sidecars.
