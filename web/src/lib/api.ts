import { CURATOR_URL, type Detectors, type ExportMode, type ExportResult, type FolderListing, type Health, type Progress, type ScanSummary, type SelectRequest, type SelectResult } from "./types";
import { exportBody } from "./paths";
import { scanBody } from "./select";
import { parseSseFrames } from "./sse";

export class ApiError extends Error {}

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
  const response = await fetch(`${CURATOR_URL}${path}`);
  if (!response.ok) throw new ApiError(await readError(response));
  return (await response.json()) as T;
}

export function thumbUrl(scanId: string, relPath: string): string {
  return `${CURATOR_URL}/thumb?${new URLSearchParams({ path: relPath, scan_id: scanId })}`;
}

export function imageUrl(scanId: string, relPath: string): string {
  return `${CURATOR_URL}/image?${new URLSearchParams({ path: relPath, scan_id: scanId })}`;
}

export const getHealth = (): Promise<Health> => getJson("/health");
export const getDetectors = (): Promise<Detectors> => getJson("/detectors");
export const getFolders = (path: string): Promise<FolderListing> =>
  getJson(`/folders?${new URLSearchParams({ path })}`);
export const getScan = (scanId: string): Promise<ScanSummary> => getJson(`/scan/${encodeURIComponent(scanId)}`);

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

async function postSse<T>(path: string, body: unknown, onProgress: (progress: Progress) => void): Promise<T> {
  const response = await fetch(`${CURATOR_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(await readError(response));
  let result: T | null = null;
  let failure: string | null = null;
  await readSse(response, (event, data) => {
    if (event === "progress") onProgress(data as Progress);
    else if (event === "complete") result = data as T;
    else if (event === "error") failure = (data as { detail?: string }).detail || "The curator reported an error.";
  });
  if (failure) throw new ApiError(failure);
  if (result == null) throw new ApiError("The curator ended the stream without a result.");
  return result;
}

export function scanFolder(
  folder: string,
  detectors: Detectors,
  onProgress: (progress: Progress) => void,
): Promise<ScanSummary> {
  return postSse("/scan/folder/stream", scanBody(folder, detectors), onProgress);
}

export async function selectScan(scanId: string, body: SelectRequest): Promise<SelectResult> {
  const response = await fetch(`${CURATOR_URL}/scan/${encodeURIComponent(scanId)}/select`, {
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
): Promise<ExportResult> {
  return postSse("/export/stream", exportBody(scanId, dest, mode, filter), onProgress);
}
