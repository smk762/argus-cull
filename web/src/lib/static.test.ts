// The static demo build's guards: with NEXT_PUBLIC_CULL_STATIC=1 every read comes from the tape
// (same-origin static files), nothing reaches the curator or /api/*, and every call that would
// scan, write, delete or export refuses with NotInDemo before it fetches anything.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { NotInDemo } from "./demo";
import { DEFAULT_FILTER, type ScanChunk } from "./types";

const TAPE = new URL("../../public/data-tape/", import.meta.url);
const fetched: string[] = [];

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_CULL_STATIC", "1");
  vi.stubEnv("NEXT_PUBLIC_CULL_TAPE_URL", "/data-tape");
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  });
  vi.stubGlobal("fetch", async (input: string) => {
    const url = String(input);
    fetched.push(url);
    if (!url.startsWith("/data-tape/")) return new Response("{}", { status: 599 });
    try {
      return new Response(readFileSync(new URL(url.slice("/data-tape/".length), TAPE)), { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("static demo api", () => {
  it("reads health, detectors, scans, the scan, cohorts, captions and labels from the tape only", async () => {
    const api = await import("./api");
    const health = await api.getHealth();
    expect(health.source_root).toBe("/data/images");
    const detectors = await api.getDetectors();
    const scans = await api.getScans();
    const scan = await api.getScan(scans!.scans[0].scan_id);
    const cohorts = await api.getCohorts();
    expect(cohorts.error).toBeNull();
    const captions = await api.getCaptions(scan.results.map((image) => image.abs_path));
    expect(Object.keys(captions)).toHaveLength(scan.results.length);
    const labels = await api.getLabels(scan.folder);
    expect(labels.folder).toBe(scan.folder);
    await api.getGuardPolicies();
    expect((await api.getDisplay()).exposedScore).toBeGreaterThan(0);
    const { availability, selectBody } = await import("./select");
    const kept = await api.selectScan(scan.scan_id, selectBody(DEFAULT_FILTER, availability(detectors, scan), scan));
    expect(kept.rows.length).toBe(scan.results.length);
    expect(api.thumbUrl(scan.scan_id, scan.results[0].rel_path)).toMatch(/^\/data-tape\/thumbs\/[a-f0-9]+\.webp$/);
    expect(api.imageUrl(scan.scan_id, scan.results[0].rel_path)).toMatch(/^\/data-tape\/images\/[a-f0-9]+\.webp$/);
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.every((url) => url.startsWith("/data-tape/"))).toBe(true);
    expect(fetched.some((url) => url.includes("/api/"))).toBe(false);
  });

  it("keeps label edits in this browser", async () => {
    const api = await import("./api");
    const scan = await api.getScan((await api.getScans())!.scans[0].scan_id);
    const rel = scan.results[0].rel_path;
    const saved = await api.putLabel(scan.folder, rel, { expect: "other", proxy: false, override: null });
    expect(saved.labels[rel]?.expect).toBe("other");
    expect((await api.getLabels(scan.folder)).labels[rel]?.expect).toBe("other");
    expect((await api.resetDemoLabels(scan.folder)).labels[rel]?.expect).not.toBe("other");
  });

  it("refuses scans of other filters, writes, deletes and exports without fetching", async () => {
    const api = await import("./api");
    const scan = await api.getScan((await api.getScans())!.scans[0].scan_id);
    const before = fetched.length;
    const refused: (() => unknown)[] = [
      () => api.cancelScan(scan.scan_id),
      () => api.purgeScans(),
      () => api.deleteCachedScan(scan.scan_id),
      () => api.deleteImages(scan.scan_id, [scan.results[0].rel_path]),
      () => api.deleteImage(scan.scan_id, scan.results[0].rel_path),
      () => api.exportScan(scan.scan_id, "out", "copy", {} as never, () => {}),
      () => api.getFolders(""),
    ];
    for (const call of refused) await expect(Promise.resolve().then(() => call())).rejects.toBeInstanceOf(NotInDemo);
    expect(fetched.length).toBe(before);
    await expect(api.selectScan(scan.scan_id, { min_score: 0.9 } as never)).rejects.toBeInstanceOf(NotInDemo);
  });

  it("replays the recorded scan for a scan request, whatever was asked", async () => {
    const api = await import("./api");
    const chunks: ScanChunk[] = [];
    const phases: string[] = [];
    const detectors = await api.getDetectors();
    const result = await api.scanFolder("/anything", detectors, null, { withGarments: false, setAge: false, readBodies: false }, (p) => phases.push(p.phase), (c) => chunks.push(c));
    expect(result.results.length).toBe(chunks.filter((c) => c.phase === "quality").flatMap((c) => c.results).length);
    expect(chunks[0].results.every((image) => image.nsfw == null)).toBe(true);
    expect(chunks.at(-1)!.pending_checks).toEqual([]);
    expect(phases[0]).toBe("starting");
  });
});
