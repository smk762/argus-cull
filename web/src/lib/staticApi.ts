/**
 * The static demo's data layer: the same calls as api.ts, answered from the
 * recorded tape (lib/tape.ts) under NEXT_PUBLIC_CULL_TAPE_URL. Reads only
 * same-origin static files; nothing here reaches the curator or `/api/*`.
 * Anything that would write, scan or export throws NotInDemo, and the page
 * shows those controls disabled before it ever gets that far.
 */
import type { BlurPolicy } from "./chunks";
import type { Caption, CohortConfig } from "./cohorts";
import { NotInDemo, tapeBase } from "./demo";
import type { ImageLabel, LabelFile } from "./labels";
import {
  browserLabels,
  parseCaptions,
  parseScan,
  parseTape,
  parseTapeCohorts,
  putBrowserLabel,
  recordedSelection,
  replaySteps,
  resetBrowserLabels,
  tapeFileUrl,
  withDetail,
  type ImageDetail,
  type KeyValueStore,
  type Tape,
} from "./tape";
import type { Detectors, GuardPolicies, Health, ImageResult, Progress, ScanChunk, ScanList, ScanSummary, SelectRequest, SelectResult } from "./types";

interface Loaded {
  tape: Tape;
  scan: ScanSummary;
}

let loading: Promise<Loaded> | null = null;
/** Set once the tape has loaded, for the synchronous image URL lookups. */
let loaded: Loaded | null = null;
const cache = new Map<string, Promise<unknown>>();

async function fetchJson(name: string): Promise<unknown> {
  const response = await fetch(`${tapeBase()}/${name}`);
  if (!response.ok) throw new Error(`Could not read the data tape (${name}: HTTP ${response.status}).`);
  return response.json();
}

function once<T>(name: string, read: () => Promise<T>): Promise<T> {
  let hit = cache.get(name) as Promise<T> | undefined;
  if (!hit) {
    hit = read();
    cache.set(name, hit);
    hit.catch(() => cache.delete(name));
  }
  return hit;
}

export function loadTape(): Promise<Loaded> {
  if (!loading) {
    loading = (async () => {
      const tape = parseTape(await fetchJson("tape.json"));
      const scan = parseScan(await fetchJson("scan.json"), tape);
      loaded = { tape, scan };
      return loaded;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** The tape, once loaded; null before. */
export function loadedTape(): Tape | null {
  return loaded?.tape ?? null;
}

export const thumbUrl = (relPath: string): string => tapeFileUrl(tapeBase(), loaded?.tape ?? null, "thumbs", relPath);
export const imageUrl = (relPath: string): string => tapeFileUrl(tapeBase(), loaded?.tape ?? null, "images", relPath);

export const getHealth = async (): Promise<Health> => (await loadTape()).tape.health;
export const getDetectors = async (): Promise<Detectors> => (await loadTape()).tape.detectors;
export const getGuardPolicies = async (): Promise<GuardPolicies | null> => (await loadTape()).tape.guard_policies;
export const getDisplay = async (): Promise<BlurPolicy> => (await loadTape()).tape.display;
export const getScans = async (): Promise<ScanList> => (await loadTape()).tape.scans;

export async function getScan(scanId: string): Promise<ScanSummary> {
  const { scan } = await loadTape();
  if (scanId !== scan.scan_id) throw new Error("This demo holds one recorded scan; that one is not on the tape.");
  return scan;
}

/** score_breakdown and the detection boxes for one image (detail/<id>.json). */
export async function getDetail(image: ImageResult): Promise<ImageResult> {
  const { tape } = await loadTape();
  const id = tape.files[image.rel_path];
  if (!id) return image;
  const detail = await once(`detail/${id}`, () => fetchJson(`detail/${id}.json`) as Promise<ImageDetail>).catch(() => null);
  return withDetail(image, detail);
}

export async function selectScan(scanId: string, request: SelectRequest): Promise<SelectResult> {
  const { tape } = await loadTape();
  const found = recordedSelection(tape, scanId, request);
  if (!found) throw new NotInDemo("A keep set for other filters");
  return found;
}

export async function getCohorts(): Promise<CohortConfig & { source: string | null; error: string | null }> {
  try {
    const config = await once("cohorts", async () => parseTapeCohorts(await fetchJson("cohorts.json")));
    return { ...config, source: "cohorts.json (on the tape)", error: null };
  } catch (err: unknown) {
    return { scene_min_conf: 0.2, tags: [], source: null, error: err instanceof Error ? err.message : "Could not read the tape's cohorts.json." };
  }
}

export async function getCaptions(paths: string[]): Promise<Record<string, Caption | null>> {
  const captions = await once("captions", async () => parseCaptions(await fetchJson("captions.json")));
  return Object.fromEntries(paths.map((abs) => [abs, captions.get(abs) ?? null]));
}

function storage(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const recordedLabels = () => once("labels", async () => (await fetchJson("labels.json")) as LabelFile).catch((): LabelFile => ({ folder: "", labels: {} }));

/** The tape's labels, or this browser's edits of them (localStorage). */
export async function getLabels(folder: string): Promise<LabelFile> {
  return browserLabels(storage(), await recordedLabels(), folder);
}

export async function putLabel(folder: string, relPath: string, label: Omit<ImageLabel, "updated_at"> | null): Promise<LabelFile> {
  return putBrowserLabel(storage(), await recordedLabels(), folder, relPath, label);
}

/** Forget this browser's label edits for the folder; the tape's labels come back. */
export async function resetLabels(folder: string): Promise<LabelFile> {
  resetBrowserLabels(storage(), folder);
  return getLabels(folder);
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * "Scan": replay the recorded scan as a live one streams, batch by batch, so
 * each frame stays blurred until its own recorded scores land. The folder,
 * policies and checks asked for are ignored; the tape holds one scan.
 */
export async function replayScan(onProgress: (progress: Progress) => void, onChunk: (chunk: ScanChunk) => void, stepMs?: number): Promise<ScanSummary> {
  const { scan } = await loadTape();
  for (const step of replaySteps(scan, 4, stepMs)) {
    if (step.delay) await wait(step.delay);
    onProgress(step.progress);
    if (step.chunk) onChunk(step.chunk);
  }
  return scan;
}

/** Every call the demo cannot make. */
export function notInDemo(what: string): never {
  throw new NotInDemo(what);
}
