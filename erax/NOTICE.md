# Licence: the erax sidecar

`app.py` and `../sidecar-common/sidecar.py` are MIT, like the rest of argus-cull. The image this directory builds
combines them with [Ultralytics](https://github.com/ultralytics/ultralytics) 8.4.181, which is **AGPL-3.0**. So the
built image is an AGPL-3.0 work, and it is labelled that way (`org.opencontainers.image.licenses`).

| Part | Licence | Notes |
|---|---|---|
| `ultralytics` 8.4.181 (PyPI) | AGPL-3.0 | |
| EraX-NSFW-V1.0 small (`erax_nsfw_yolo11s.pt`) | Apache-2.0 per its authors; AGPL-3.0 per Ultralytics | Ultralytics states that "all Ultralytics YOLO trained models fall under the AGPL-3.0 License by default". Treat them as AGPL-3.0 here; the image is AGPL-3.0 anyway. |

What this means here:

- **Keep it behind HTTP.** Curator and every other Argus package call this sidecar over `POST /infer` and never
  import `ultralytics`. argus-ci's `agpl-import` suite rule enforces that; the `nosemgrep` on the import in
  `app.py` exempts this sidecar alone.
- **The image is built locally and not published.** `release.yml` pushes only the web image.
- **Not in a public deployment without a source offer**, and not in anything commercial without advice. AGPL section
  13 requires offering the source to anyone who uses the program over a network. Ultralytics also says an Enterprise
  licence is needed for "SaaS platforms, APIs, or cloud systems that use YOLO behind the scenes", and for any
  commercial product. Today the sidecar runs only beside a local curator. The public demo replays a recorded tape and
  runs no sidecars.
