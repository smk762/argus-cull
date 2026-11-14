// The recorded data tape (scripts/record_tape.py) and the pure helpers that read it (lib/tape.ts).
// Runs against the committed tape in public/data-tape, so a re-recorded tape is checked too.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { awaitingChecks, DEFAULT_BLUR, mergeChunk, shouldBlur } from "./chunks";
import { autoTags, parseCohortConfig } from "./cohorts";
import { availability, selectBody } from "./select";
import { runStats } from "./runStats";
import {
  browserLabels,
  hasBrowserLabels,
  parseCaptions,
  parseScan,
  parseTape,
  putBrowserLabel,
  recordedSelection,
  replaySteps,
  requestKey,
  resetBrowserLabels,
  tapeFileUrl,
  unscored,
  withDetail,
  type KeyValueStore,
} from "./tape";
import { DEFAULT_FILTER, type ScanSummary } from "./types";

const TAPE = new URL("../../public/data-tape/", import.meta.url);
const readTape = (name: string) => JSON.parse(readFileSync(new URL(name, TAPE), "utf8")) as unknown;
const tape = parseTape(readTape("tape.json"));
const scan = parseScan(readTape("scan.json"), tape);

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
}

describe("the committed tape", () => {
  it("has provenance: kind, curator version and when it was made", () => {
    expect(["recorded", "sample"]).toContain(tape.provenance.kind);
    expect(Date.parse(tape.generated_at)).not.toBeNaN();
    expect(tape.provenance.curator).toHaveProperty("version");
    expect(tape.scan_config).toHaveProperty("guard_config");
  });

  it("has a thumbnail, a view and a detail file for every image", () => {
    for (const image of scan.results) {
      const id = tape.files[image.rel_path];
      for (const file of [`thumbs/${id}.webp`, `images/${id}.webp`, `detail/${id}.json`]) expect(existsSync(new URL(file, TAPE)), file).toBe(true);
    }
    expect(readdirSync(new URL("thumbs/", TAPE))).toHaveLength(scan.results.length);
  });

  it("recorded the keep set for exactly the body the page sends with the default filters", () => {
    const request = selectBody(DEFAULT_FILTER, availability(tape.detectors, scan), scan);
    expect(requestKey(request)).toBe(requestKey(tape.select.request));
    expect(recordedSelection(tape, scan.scan_id, request)).toBe(tape.select.result);
    expect(recordedSelection(tape, scan.scan_id, { ...request, min_score: 0.8 })).toBeNull();
    expect(recordedSelection(tape, "another-scan", request)).toBeNull();
    expect(tape.select.result.rows.map((row) => row.rel_path).sort()).toEqual(scan.results.map((image) => image.rel_path).sort());
  });

  it("names no host path, private address or local host name", () => {
    for (const name of ["tape.json", "scan.json", "captions.json", "labels.json"]) {
      const text = readFileSync(new URL(name, TAPE), "utf8");
      expect(text, name).not.toMatch(/\/home\/|\/Users\/|\b192\.168\.|\b10\.\d+\.\d+\.\d+\b|\.local\b|\.lan\b/);
    }
    for (const image of scan.results) expect(image.abs_path.startsWith(`${scan.folder}/`)).toBe(true);
    expect(tape.health.source_root).toBe("/data/images");
  });

  it("carries cohorts and captions the page can read, and they tag something", () => {
    const cohorts = parseCohortConfig(readTape("cohorts.json"));
    const captions = parseCaptions(readTape("captions.json"));
    const tagged = scan.results.filter((image) => autoTags(image, captions.get(image.abs_path), cohorts).length > 0);
    expect(tagged.length).toBeGreaterThan(0);
  });

  it("is enough for Run stats in the browser", () => {
    const stats = runStats(scan, tape.select.result, new Map(), new Map(), { scene_min_conf: 0.2, tags: [] }, ["adult"], new Date(0), {
      curatorVersion: tape.provenance.curator.version,
      cullVersion: "test",
      filters: tape.select.request,
      blur: tape.display,
      faceNames: {},
      policiesOff: [],
    });
    expect(JSON.stringify(stats)).toContain(scan.scan_id);
  });
});

describe("parseTape", () => {
  const good = readTape("tape.json") as Record<string, unknown>;
  it("refuses another format, version or an unsafe file id", () => {
    expect(() => parseTape({ ...good, format: "lightbox" })).toThrow(/format/);
    expect(() => parseTape({ ...good, version: 2 })).toThrow(/version/);
    expect(() => parseTape({ ...good, files: { "a.png": "../../etc" } })).toThrow(/file id/);
    expect(() => parseTape({ ...good, provenance: { kind: "live", curator: {} } })).toThrow(/kind/);
    expect(() => parseTape(null)).toThrow();
  });

  it("refuses a scan.json that is not the listed scan or misses a file", () => {
    expect(() => parseScan({ ...scan, scan_id: "other" }, tape)).toThrow(/not the scan/);
    expect(() => parseScan({ ...scan, results: [...scan.results, { ...scan.results[0], rel_path: "new.png" }] }, tape)).toThrow(/no file/);
  });
});

describe("tape files", () => {
  it("map a rel_path to its webp, and an unknown one to nothing", () => {
    const rel = scan.results[0].rel_path;
    expect(tapeFileUrl("/data-tape", tape, "thumbs", rel)).toBe(`/data-tape/thumbs/${tape.files[rel]}.webp`);
    expect(tapeFileUrl("/data-tape", tape, "images", "missing.png")).toBe("");
    expect(tapeFileUrl("/data-tape", null, "images", rel)).toBe("");
  });

  it("put the detail-only fields back", () => {
    const image = scan.results.find((item) => item.nsfw)!;
    expect(image.score_breakdown).toBeUndefined();
    const detail = JSON.parse(readFileSync(new URL(`detail/${tape.files[image.rel_path]}.json`, TAPE), "utf8"));
    const full = withDetail(image, detail);
    expect(full.score_breakdown).toBeDefined();
    expect(full.nsfw?.exposed_score).toBe(image.nsfw?.exposed_score);
    expect(withDetail(image, null)).toBe(image);
  });
});

describe("replaySteps", () => {
  const steps = replaySteps(scan);
  const fold = (upTo: number) => {
    let summary: ScanSummary | null = null;
    let pending: readonly string[] = [];
    for (const step of steps.slice(0, upTo)) {
      pending = step.progress.pending_checks ?? [];
      if (step.chunk) summary = mergeChunk(summary, step.chunk);
    }
    return { summary: summary!, pending };
  };

  it("streams the quality pass first, with every slow check pending and nothing scored", () => {
    const quality = steps.filter((step) => step.progress.phase === "quality");
    const firstPassEnd = steps.indexOf(quality.at(-1)!) + 1;
    const { summary, pending } = fold(firstPassEnd);
    expect(summary.results).toHaveLength(scan.results.length);
    expect(pending).toEqual(expect.arrayContaining(["nsfw"]));
    for (const image of summary.results) {
      expect(image.nsfw ?? null).toBeNull();
      expect(image.guard ?? null).toBeNull();
      // Blurred until scored: every frame is still waiting, so every tile is veiled.
      expect(awaitingChecks(image, pending)).toBe(true);
      expect(shouldBlur(image, pending, DEFAULT_BLUR, null)).toBe(true);
    }
  });

  it("ends with the recorded results and nothing pending, so each frame's blur follows its own scores", () => {
    const { summary, pending } = fold(steps.length);
    expect(pending).toEqual([]);
    expect(summary.results).toEqual(scan.results);
    expect(summary.face_clusters).toEqual(scan.face_clusters);
    const blurred = summary.results.filter((image) => shouldBlur(image, pending, DEFAULT_BLUR, null));
    expect(blurred.length).toBeGreaterThan(0);
    expect(blurred.length).toBeLessThan(summary.results.length);
  });

  it("strips only what the scan ran", () => {
    const image = scan.results.find((item) => item.nsfw && item.primary_face_attributes)!;
    const noFaces = unscored(image, ["nsfw"]);
    expect(noFaces.nsfw).toBeNull();
    expect(noFaces.primary_face_attributes).toEqual(image.primary_face_attributes);
  });
});

describe("labels in this browser", () => {
  const recorded = readTape("labels.json") as { folder: string; labels: Record<string, never> };

  it("start as the tape's, change locally, and reset", () => {
    const store = memoryStore();
    const folder = recorded.folder;
    expect(browserLabels(store, recorded, folder).labels).toEqual(recorded.labels);
    const rel = scan.results[0].rel_path;
    const next = putBrowserLabel(store, recorded, folder, rel, { expect: "safe", proxy: false, override: null }, new Date("2026-01-01T00:00:00Z"));
    expect(next.labels[rel]).toMatchObject({ expect: "safe", updated_at: "2026-01-01T00:00:00.000Z" });
    expect(hasBrowserLabels(store, folder)).toBe(true);
    expect(browserLabels(store, recorded, folder).labels[rel]?.expect).toBe("safe");
    // Clearing a recorded label sticks too.
    const firstRecorded = Object.keys(recorded.labels)[0];
    if (firstRecorded) expect(putBrowserLabel(store, recorded, folder, firstRecorded, null).labels[firstRecorded]).toBeUndefined();
    resetBrowserLabels(store, folder);
    expect(browserLabels(store, recorded, folder).labels).toEqual(recorded.labels);
  });

  it("survive blocked or broken storage", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(browserLabels(broken, recorded, recorded.folder).labels).toEqual(recorded.labels);
    expect(putBrowserLabel(broken, recorded, recorded.folder, "x.png", { expect: "adult", proxy: false, override: null }).labels["x.png"]?.expect).toBe("adult");
    expect(() => resetBrowserLabels(broken, recorded.folder)).not.toThrow();
    const store = memoryStore();
    store.setItem(`argus-cull-demo:labels:${recorded.folder}`, "{not json");
    expect(browserLabels(store, recorded, recorded.folder).labels).toEqual(recorded.labels);
    expect(browserLabels(null, recorded, "/elsewhere").labels).toEqual({});
  });
});
