/**
 * The recorded data tape the static demo reads (scripts/record_tape.py writes
 * it). Pure: parsing, lookups and the scan replay are here and unit-tested;
 * staticApi.ts does the fetching.
 */
import type { Caption, CohortConfig } from "./cohorts";
import { parseCohortConfig } from "./cohorts";
import { emptyLabel, type ImageLabel, type LabelFile } from "./labels";
import type { BlurPolicy } from "./chunks";
import type { Detectors, GuardPolicies, Health, ImageResult, Progress, ScanChunk, ScanList, ScanSummary, SelectRequest, SelectResult } from "./types";

export const TAPE_FORMAT = "argus-cull-tape";
export const TAPE_VERSION = 1;

export type TapeKind = "recorded" | "sample";

export interface TapeProvenance {
  /** `recorded`: a real curator run, replayed. `sample`: hand-written or synthetic results. */
  kind: TapeKind;
  source: "curator" | "saved-scan" | string;
  curator: { version: string | null; commit: string | null };
  note: string | null;
}

export interface TapeStats {
  total: number;
  passed: number | null;
  rejected: number | null;
  duplicates: number | null;
  reject_reasons: Record<string, number>;
  kept: number | null;
  faces: number;
  nudenet_checked: number;
  flagged_by_policy: Record<string, number>;
}

export interface Tape {
  format: typeof TAPE_FORMAT;
  version: number;
  generated_at: string;
  provenance: TapeProvenance;
  scan_config: Record<string, unknown>;
  stats: TapeStats;
  health: Health;
  detectors: Detectors;
  guard_policies: GuardPolicies | null;
  display: BlurPolicy;
  scans: ScanList;
  select: { request: SelectRequest; result: SelectResult };
  /** rel_path -> file id (thumbs/<id>.webp, images/<id>.webp, detail/<id>.json). */
  files: Record<string, string>;
}

/** Fields scan.json leaves out of each result; detail/<id>.json carries them. */
export interface ImageDetail {
  score_breakdown?: Record<string, number>;
  nsfw?: { detections: NonNullable<ImageResult["nsfw"]>["detections"] };
  erax?: { detections: NonNullable<ImageResult["erax"]>["detections"] };
}

function fail(problem: string): never {
  throw new Error(`The data tape is not usable: ${problem}.`);
}

function object(value: unknown, where: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) fail(`${where} must be an object`);
  return value as Record<string, unknown>;
}

/** Check tape.json enough that the page can trust its shape; throws with the first problem. */
export function parseTape(raw: unknown): Tape {
  const tape = object(raw, "tape.json");
  if (tape.format !== TAPE_FORMAT) fail(`format is ${JSON.stringify(tape.format)}, not ${TAPE_FORMAT}`);
  if (tape.version !== TAPE_VERSION) fail(`version ${String(tape.version)} is not ${TAPE_VERSION}; re-record it or update the page`);
  if (typeof tape.generated_at !== "string" || Number.isNaN(Date.parse(tape.generated_at))) fail("generated_at must be a date");
  const provenance = object(tape.provenance, "provenance");
  if (provenance.kind !== "recorded" && provenance.kind !== "sample") fail("provenance.kind must be recorded or sample");
  object(provenance.curator, "provenance.curator");
  object(tape.health, "health");
  object(tape.detectors, "detectors");
  object(tape.display, "display");
  const scans = object(tape.scans, "scans");
  if (!Array.isArray(scans.scans) || scans.scans.length === 0) fail("scans.scans must list the recorded scan");
  const select = object(tape.select, "select");
  object(select.request, "select.request");
  const result = object(select.result, "select.result");
  if (!Array.isArray(result.rows)) fail("select.result.rows must be a list");
  const files = object(tape.files, "files");
  for (const [rel, id] of Object.entries(files)) {
    // Ids become file names in URLs.
    if (typeof id !== "string" || !/^[a-f0-9]{8,64}$/.test(id)) fail(`files[${JSON.stringify(rel)}] is not a file id`);
  }
  return raw as Tape;
}

/** Check scan.json against the tape: same scan, and a file for every result. */
export function parseScan(raw: unknown, tape: Tape): ScanSummary {
  const scan = object(raw, "scan.json");
  if (typeof scan.scan_id !== "string" || typeof scan.folder !== "string") fail("scan.json needs scan_id and folder");
  if (!Array.isArray(scan.results)) fail("scan.json results must be a list");
  if (scan.scan_id !== tape.scans.scans[0].scan_id) fail("scan.json is not the scan tape.json lists");
  for (const image of scan.results as ImageResult[]) {
    if (!tape.files[image.rel_path]) fail(`no file for ${image.rel_path}`);
  }
  return raw as ScanSummary;
}

export function parseCaptions(raw: unknown): Map<string, Caption | null> {
  const captions = object(raw, "captions.json");
  const out = new Map<string, Caption | null>();
  for (const [abs, caption] of Object.entries(captions)) {
    if (caption == null) out.set(abs, null);
    else {
      const entry = object(caption, `captions[${abs}]`);
      out.set(abs, { text: typeof entry.text === "string" ? entry.text : "", keywords: Array.isArray(entry.keywords) ? entry.keywords.filter((word): word is string => typeof word === "string") : [] });
    }
  }
  return out;
}

export function parseTapeCohorts(raw: unknown): CohortConfig {
  return parseCohortConfig(raw);
}

/** A select body as a stable string: keys sorted, absent and undefined fields dropped. */
export function requestKey(request: SelectRequest | Record<string, unknown>): string {
  const entries = Object.entries(request)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}

/** The recorded keep set for this request, or null when the tape did not record it. */
export function recordedSelection(tape: Tape, scanId: string, request: SelectRequest): SelectResult | null {
  if (scanId !== tape.select.result.scan_id) return null;
  return requestKey(request) === requestKey(tape.select.request) ? tape.select.result : null;
}

export function tapeFileUrl(base: string, tape: Pick<Tape, "files"> | null, kind: "thumbs" | "images", relPath: string): string {
  const id = tape?.files[relPath];
  return id ? `${base}/${kind}/${id}.webp` : "";
}

/** A result with its detail-only fields put back. */
export function withDetail(image: ImageResult, detail: ImageDetail | null): ImageResult {
  if (!detail) return image;
  const next: ImageResult = { ...image };
  if (detail.score_breakdown) next.score_breakdown = detail.score_breakdown;
  if (detail.nsfw && image.nsfw) next.nsfw = { ...image.nsfw, detections: detail.nsfw.detections };
  if (detail.erax && image.erax) next.erax = { ...image.erax, detections: detail.erax.detections };
  return next;
}

// ---------------------------------------------------------------- replay

/** The slow checks a scan ran, in the curator's `pending_checks` names. */
export function checksRun(summary: ScanSummary): string[] {
  const checks: string[] = [];
  if (summary.faces_config?.enabled) checks.push("faces");
  if (summary.nsfw_config?.enabled) checks.push("nsfw");
  if (summary.guard_config?.enabled) checks.push("guard");
  return checks;
}

/**
 * A result as it reads before the slow checks report: no ages, no NudeNet or
 * EraX reading, no verdicts. The quality pass (score, reject, duplicates) is
 * already in, the way the curator's first batches arrive.
 */
export function unscored(image: ImageResult, checks: readonly string[]): ImageResult {
  const next: ImageResult = { ...image };
  if (checks.includes("faces")) {
    next.faces = [];
    next.primary_face_attributes = null;
    next.set_age = null;
    next.people = undefined;
    next.people_check = null;
  }
  if (checks.includes("nsfw")) {
    next.nsfw = null;
    next.content_rating = null;
    next.erax = null;
    next.erax_filled = false;
    next.nudenet_failed = false;
  }
  if (checks.includes("guard")) {
    next.guard = null;
    next.guard_variants = {};
  }
  return next;
}

export interface ReplayStep {
  /** Milliseconds after the previous step. */
  delay: number;
  progress: Progress;
  chunk: ScanChunk | null;
}

/**
 * The recorded scan as the stream a live scan sends: the quality pass in a few
 * batches with every slow check pending (so tiles stay blurred and say
 * Scanning…), then the scored results batch by batch while the pending list
 * shrinks, so each frame's blur follows its own recorded scores.
 */
export function replaySteps(summary: ScanSummary, batches = 4, stepMs = 320): ReplayStep[] {
  const checks = checksRun(summary);
  const results = summary.results;
  const total = results.length;
  const size = Math.max(1, Math.ceil(total / batches));
  const steps: ReplayStep[] = [{ delay: 0, progress: { phase: "starting", done: 0, total, pending_checks: checks }, chunk: null }];
  const base = { scan_id: summary.scan_id, folder: summary.folder, total };
  for (let start = 0; start < total; start += size) {
    const done = Math.min(total, start + size);
    steps.push({
      delay: stepMs,
      progress: { phase: "quality", done, total, pending_checks: checks },
      chunk: { ...base, phase: "quality", done, pending_checks: checks, results: results.slice(start, done).map((image) => unscored(image, checks)) },
    });
  }
  for (let start = 0; start < total; start += size) {
    const done = Math.min(total, start + size);
    const pending = done < total ? checks : [];
    const phase = checks.at(-1) ?? "quality";
    steps.push({
      delay: stepMs,
      progress: { phase, done, total, pending_checks: pending },
      chunk: { ...base, phase, done, pending_checks: pending, results: results.slice(start, done), face_clusters: done === total ? summary.face_clusters : undefined },
    });
  }
  return steps;
}

// ---------------------------------------------------------------- labels in this browser

export const LABEL_STORAGE_PREFIX = "argus-cull-demo:labels:";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Labels for the folder: this browser's copy when it has one, else the tape's. */
export function browserLabels(store: KeyValueStore | null, recorded: LabelFile, folder: string): LabelFile {
  try {
    const raw = store?.getItem(LABEL_STORAGE_PREFIX + folder);
    if (raw) {
      const parsed = JSON.parse(raw) as { labels?: unknown };
      if (parsed.labels && typeof parsed.labels === "object" && !Array.isArray(parsed.labels)) return { folder, labels: parsed.labels as Record<string, ImageLabel> };
    }
  } catch {
    // Blocked or broken storage: the recorded labels still show.
  }
  return { folder, labels: folder === recorded.folder ? { ...recorded.labels } : {} };
}

/** Set or clear one label in this browser's copy, the way the page's server does it on disk. */
export function putBrowserLabel(
  store: KeyValueStore | null,
  recorded: LabelFile,
  folder: string,
  relPath: string,
  label: Omit<ImageLabel, "updated_at"> | null,
  now: Date = new Date(),
): LabelFile {
  const current = browserLabels(store, recorded, folder);
  if (label == null || emptyLabel(label)) delete current.labels[relPath];
  else current.labels[relPath] = { ...label, updated_at: now.toISOString() };
  try {
    store?.setItem(LABEL_STORAGE_PREFIX + folder, JSON.stringify(current));
  } catch {
    // Storage full or blocked: the change lasts until the page is closed.
  }
  return current;
}

export function resetBrowserLabels(store: KeyValueStore | null, folder: string): void {
  try {
    store?.removeItem(LABEL_STORAGE_PREFIX + folder);
  } catch {
    // Nothing stored.
  }
}

export function hasBrowserLabels(store: KeyValueStore | null, folder: string): boolean {
  try {
    return store?.getItem(LABEL_STORAGE_PREFIX + folder) != null;
  } catch {
    return false;
  }
}
