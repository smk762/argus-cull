# Argus Cull

A demo for [argus-curator](https://github.com/smk762/argus-curator). Point it at a folder and see which images the curator would keep, and why. The grid, the path list, and export all use the filter the curator already applies. The browser does not score images.

Lightbox is the demo for argus-lens. This is the demo for the curator. The suite UI stays in argus-studio.

## Run

Curator 0.4 publishes `POST /scan/{id}/select`, `GET /image`, NudeNet, and SingGuard. The compose file runs that image with a NudeNet server and a SingGuard server beside it:

```bash
cp .env.example .env
docker compose up --build
```

The UI is http://localhost:3000 and the curator is http://localhost:8101. Both ports are published on this host, so another device opens `http://<this-host>:3000` and does not need a clone. The browser calls the curator on that same host, port 8101. Name that page origin in `CURATOR_CORS_ORIGINS` (a set value replaces the localhost allow-list, so keep `http://localhost:3000` and `http://127.0.0.1:3000` in the list). `NEXT_PUBLIC_CURATOR_URL` supplies the scheme and port and is baked into the web image. The default source mount is `./fixture`. Export lands in `./out`. NudeNet is on unless `ARGUS_CURATOR_NUDENET_URL` is set empty. SingGuard is the `singguard` service (`POST /api/guard/check` on port 9150, `inclusionAI/Sing-Guard-4b`). It needs an NVIDIA GPU. The first start downloads the weights. Set `ARGUS_CURATOR_SINGGUARD_URL` empty to turn the check off. `ARGUS_CURATOR_SINGGUARD_THINKING=fast-slow` also records why a rule fired.

To build the sibling `../argus-curator` checkout instead of the published image:

```bash
docker compose -f docker-compose.yaml -f docker-compose.local-curator.yaml up --build
```

`NEXT_PUBLIC_CURATOR_URL` is baked in at image build time and defaults to `http://localhost:8101`, which is the published port the browser can reach.

GPU machines can add the device reservation the curator compose uses:

```bash
docker compose -f docker-compose.yaml -f docker-compose.gpu.yaml up --build
```

Move stays off unless `CURATOR_ALLOW_MOVE=1` is set on the curator service. The export dialog names move as destructive and disables it when the server refuses it.

Without Docker, from `web/`:

```bash
npm install
npm run dev
```

and, from the curator repo, `argus-curator serve --cors --port 8101 --source-root … --export-root …`.

## What the page does

Scan streams progress from `POST /scan/folder/stream`. Image batches arrive while the scan is still running, so the grid fills before the slow checks finish, and the bar keeps the phase and the count. The page lists finished scans above the one still running, and will not start a second one while one is running. Blur lifts as soon as the NudeNet exposed score is under `ARGUS_CULL_BLUR_EXPOSED_SCORE` (default 0.25), and comes back if policy marks the image unsafe. Set `ARGUS_CULL_POLICY_BLUR=0` to leave it off. The grid can be sorted by that score, by the policy verdict, or by the youngest MiVOLO age, and the arrow reverses the order. An age range next to the sort hides other frames from the gallery without changing which files the scan keeps. Previous and Next in the detail view walk that order. Export uses the same bar. Changing the folder clears that scan from the page. Cached scans stay in the list, so a finished one can be opened again. Optional detectors are requested only when `GET /detectors` says they are loaded, so a missing ONNX file disables that filter group instead of failing the scan. The group names the convert command: `fairface-convert`, `mivolo-convert`, `places365-convert`, or `garments-convert`.

Changing a filter calls `POST /scan/{id}/select`. Counts and `keep_reason` update without another scan. Rejected images stay on the grid.

Download paths writes two files in the browser and does not touch the export root: kept `rel_path`s, one per line, and a JSONL of `{rel_path, abs_path, keep_reason}` for every image. Export is separate. It copies, symlinks, or moves through `POST /export/stream`, then offers the manifest's `exported_abs_path` list.

People lists the clusters the scan already computed. The shared URL holds the scan id and the filter.

NudeNet and SingGuard stay hidden until `/detectors` reports them. A threshold or a rule list is sent on the select and export bodies the server already accepts. Flagged frames stay blurred until you show the image. This page does not invent a score.

## Fixture

`fixture/` is a handful of drawn shapes: faces, scenes, garments, one identical pair, and one blurred frame. It is labeled as a fixture. CI installs `argus-curator` with no GPU extras and scans it.

## Develop

```bash
cd web
npm run lint && npm run typecheck && npm test && npm run build
```
