import { curatorUrl, type Detectors, type ExportMode, type ExportResult, type FolderListing, type GuardPolicies, type Health, type Progress, type PurgeResult, type ScanChunk, type ScanList, type ScanSummary, type SelectRequest, type SelectResult } from "./types";
import type { Caption, CohortConfig } from "./cohorts";
import type { ImageLabel, LabelFile } from "./labels";
import { exportBody, type ExportExtras } from "./paths";
import type { PolicyChoice } from "./policies";
import { scanBody, type ScanChecks } from "./select";
import { parseSseFrames } from "./sse";
import { DEFAULT_BLUR, type BlurPolicy } from "./chunks";
import { staticDemo } from "./demo";
import * as demo from "./staticApi";
import { frameSource, VEIL_CELLS, type FrameSource, type Veil, type VeilStrength } from "./veil";

export class ApiError extends Error {}

/** The scan stream ended because someone stopped the scan. Not a failure. */
export class ScanStopped extends ApiError {}

export async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail != null) return JSON.stringify(body.detail);
  } catch {
    // A non-JSON error body still needs a readable message.
  }
  return response.statusText || `HTTP ${response.status}`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${curatorUrl()}${path}`);
  if (!response.ok) throw new ApiError(await readError(response));
  return (await response.json()) as T;
}

export function thumbUrl(scanId: string, relPath: string): string {
  if (staticDemo()) return demo.thumbUrl(relPath);
  return `${curatorUrl()}/thumb?${new URLSearchParams({ path: relPath, scan_id: scanId })}`;
}

export function imageUrl(scanId: string, relPath: string): string {
  if (staticDemo()) return demo.imageUrl(relPath);
  return `${curatorUrl()}/image?${new URLSearchParams({ path: relPath, scan_id: scanId })}`;
}

/** A veiled frame's mosaic file: the static tape's, or null live, where the page draws it from the thumbnail. */
export function veilUrl(relPath: string, strength: VeilStrength): string | null {
  return staticDemo() ? demo.veilUrl(relPath, strength) : null;
}

/** Cells across the long side per veil strength: the tape's in the demo, else the page's. */
export function veilCells(): Record<VeilStrength, number> {
  return (staticDemo() ? demo.veilCells() : null) ?? VEIL_CELLS;
}

/** What a frame shows in a tile or the detail view; see `frameSource`. A veiled frame never names the thumbnail or full view. */
export function frameFor(scanId: string, relPath: string, veil: Pick<Veil, "strength"> | null, view: "tile" | "detail"): FrameSource {
  return frameSource(veil, { veil: (strength) => veilUrl(relPath, strength), thumb: thumbUrl(scanId, relPath), image: imageUrl(scanId, relPath) }, view, veilCells());
}

export const getHealth = (): Promise<Health> => (staticDemo() ? demo.getHealth() : getJson("/health"));
export const getDetectors = (): Promise<Detectors> => (staticDemo() ? demo.getDetectors() : getJson("/detectors"));

/** The blur policy: this page's server env (ARGUS_CULL_BLUR_EXPOSED_SCORE, ARGUS_CULL_POLICY_BLUR), or the tape's. */
export async function getDisplay(): Promise<BlurPolicy> {
  if (staticDemo()) return demo.getDisplay();
  const body = (await (await fetch("/api/display")).json()) as BlurPolicy;
  return typeof body.exposedScore === "number" ? body : DEFAULT_BLUR;
}

/** Static demo only: put the detail-only fields (score breakdown, boxes) back on one result. */
export const getImageDetail = demo.getDetail;

/** Curator 0.8. An older server answers 404; the page then has names but not wording. */
export async function getGuardPolicies(): Promise<GuardPolicies | null> {
  if (staticDemo()) return demo.getGuardPolicies();
  const response = await fetch(`${curatorUrl()}/guard/policies`);
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(await readError(response));
  return (await response.json()) as GuardPolicies;
}
export const getFolders = (path: string): Promise<FolderListing> =>
  staticDemo() ? demo.notInDemo("Browsing the source folder") : getJson(`/folders?${new URLSearchParams({ path })}`);
export const getScan = (scanId: string): Promise<ScanSummary> => (staticDemo() ? demo.getScan(scanId) : getJson(`/scan/${encodeURIComponent(scanId)}`));

export async function getScans(): Promise<ScanList | null> {
  if (staticDemo()) return demo.getScans();
  const response = await fetch(`${curatorUrl()}/scans`);
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(await readError(response));
  return (await response.json()) as ScanList;
}

export async function readSse(response: Response, onEvent: (event: string, data: unknown) => void): Promise<void> {
  if (!response.body) throw new ApiError("The curator response had no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  while (true) {
    const { done, value } = await reader.read();
    rest += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parsed = parseSseFrames(rest);
    rest = parsed.rest;
    for (const frame of parsed.events) onEvent(frame.event, frame.data);
    if (done) break;
  }
}

async function postSse<T>(
  path: string,
  body: unknown,
  onProgress: (progress: Progress) => void,
  onChunk?: (chunk: ScanChunk) => void,
): Promise<T> {
  const response = await fetch(`${curatorUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(await readError(response));
  let result: T | null = null;
  let failure: string | null = null;
  let stopped = false;
  await readSse(response, (event, data) => {
    if (event === "progress") onProgress(data as Progress);
    else if (event === "chunk") onChunk?.(data as ScanChunk);
    else if (event === "complete") result = data as T;
    else if (event === "cancelled") stopped = true;
    else if (event === "error") failure = (data as { detail?: string }).detail || "The curator reported an error.";
  });
  if (stopped) throw new ScanStopped("The scan was stopped.");
  if (failure) throw new ApiError(failure);
  if (result == null) throw new ApiError("The curator ended the stream without a result.");
  return result;
}

/** Stop the running scan (curator 0.6). The curator drops its partial summary. */
export async function cancelScan(scanId: string): Promise<void> {
  if (staticDemo()) demo.notInDemo("Stopping a scan");
  const response = await fetch(`${curatorUrl()}/scan/${encodeURIComponent(scanId)}/cancel`, { method: "POST" });
  if (!response.ok) throw new ApiError(await readError(response));
}

/** Stop the running scan, if any, and delete every cached scan (curator 0.6). Source images stay. */
export async function purgeScans(): Promise<PurgeResult> {
  if (staticDemo()) demo.notInDemo("Purging scans");
  const response = await fetch(`${curatorUrl()}/scans/purge`, { method: "POST" });
  if (!response.ok) throw new ApiError(await readError(response));
  return (await response.json()) as PurgeResult;
}

/** Remove one cached scan (curator 0.12). Source images stay. The curator refuses the running scan. */
export async function deleteCachedScan(scanId: string): Promise<void> {
  if (staticDemo()) demo.notInDemo("Removing a cached scan");
  const response = await fetch(`${curatorUrl()}/scan/${encodeURIComponent(scanId)}`, { method: "DELETE" });
  if (!response.ok) throw new ApiError(await readError(response));
}

export function scanFolder(
  folder: string,
  detectors: Detectors,
  policies: PolicyChoice | null,
  checks: ScanChecks,
  onProgress: (progress: Progress) => void,
  onChunk: (chunk: ScanChunk) => void,
): Promise<ScanSummary> {
  // The demo replays its one recorded scan the way a live one streams in.
  if (staticDemo()) return demo.replayScan(onProgress, onChunk);
  return postSse("/scan/folder/stream", scanBody(folder, detectors, policies, checks), onProgress, onChunk);
}

/** Labels live on this page's server, not the curator. The folder is the one the scan reports. */
export async function getLabels(folder: string): Promise<LabelFile> {
  if (staticDemo()) return demo.getLabels(folder);
  const response = await fetch(`/api/labels?${new URLSearchParams({ folder })}`);
  if (!response.ok) throw new ApiError(await readError(response));
  return (await response.json()) as LabelFile;
}

export async function putLabel(folder: string, relPath: string, label: Omit<ImageLabel, "updated_at"> | null): Promise<LabelFile> {
  if (staticDemo()) return demo.putLabel(folder, relPath, label);
  const response = await fetch("/api/labels", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder, rel_path: relPath, label }),
  });
  if (!response.ok) throw new ApiError(await readError(response));
  return (await response.json()) as LabelFile;
}

/** The setting and wardrobe rules from cohorts.json, as this page's server read them. */
export async function getCohorts(): Promise<CohortConfig & { source: string | null; error: string | null }> {
  if (staticDemo()) return demo.getCohorts();
  const response = await fetch("/api/cohorts");
  if (!response.ok) throw new ApiError(await readError(response));
  return (await response.json()) as CohortConfig & { source: string | null; error: string | null };
}

/** Caption sidecars for these image paths (`abs_path`). A path with no sidecar maps to null. */
export async function getCaptions(paths: string[]): Promise<Record<string, Caption | null>> {
  if (staticDemo()) return demo.getCaptions(paths);
  const response = await fetch("/api/captions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!response.ok) throw new ApiError(await readError(response));
  return ((await response.json()) as { captions: Record<string, Caption | null> }).captions;
}

export async function deleteImage(scanId: string, relPath: string): Promise<void> {
  await deleteImages(scanId, [relPath]);
}

export async function deleteImages(scanId: string, relPaths: string[]): Promise<void> {
  if (staticDemo()) demo.notInDemo("Deleting files");
  const response = await fetch(`${curatorUrl()}/scan/${encodeURIComponent(scanId)}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(relPaths.length === 1 ? { rel_path: relPaths[0] } : { rel_paths: relPaths }),
  });
  if (!response.ok) throw new ApiError(await readError(response));
}

export async function selectScan(scanId: string, body: SelectRequest): Promise<SelectResult> {
  if (staticDemo()) return demo.selectScan(scanId, body);
  const response = await fetch(`${curatorUrl()}/scan/${encodeURIComponent(scanId)}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(await readError(response));
  return (await response.json()) as SelectResult;
}

export function exportScan(
  scanId: string,
  dest: string,
  mode: ExportMode,
  filter: SelectRequest,
  onProgress: (progress: Progress) => void,
  extras: ExportExtras = {},
): Promise<ExportResult> {
  if (staticDemo()) demo.notInDemo("Export");
  return postSse("/export/stream", exportBody(scanId, dest, mode, filter, extras), onProgress);
}
export const resetDemoLabels = demo.resetLabels;
