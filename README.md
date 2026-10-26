# Argus Cull

A demo for [argus-curator](https://github.com/smk762/argus-curator). Point it at a folder and see which images the curator would keep, and why. The grid, the path list, and export all use the filter the curator already applies. The browser does not score images.

Lightbox is the demo for argus-lens. This is the demo for the curator. The suite UI stays in argus-studio.

## Run

Curator 0.4 publishes `POST /scan/{id}/select`, `GET /image`, NudeNet, and SingGuard. The compose file runs that image and a NudeNet server beside it:

```bash
docker compose up --build
```

The UI is http://localhost:3000 and the curator is http://localhost:8101. The default source mount is `./fixture`. Export lands in `./out`. NudeNet is on unless `ARGUS_CURATOR_NUDENET_URL` is set empty. SingGuard stays off until `ARGUS_CURATOR_SINGGUARD_URL` points at a SingGuard server.

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

Scan streams progress from `POST /scan/folder/stream`. Optional detectors are requested only when `GET /detectors` says they are loaded, so a missing ONNX file disables that filter group instead of failing the scan. The group names the convert command: `fairface-convert`, `mivolo-convert`, `places365-convert`, or `garments-convert`.

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
