// The demo's in-browser keep set (demoSelect.ts) against the curator's recorded one. Runs against the committed tape.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { demoKeepReason, demoSelection } from "./demoSelect";
import { availability, selectBody } from "./select";
import { parseScan, parseTape } from "./tape";
import { DEFAULT_FILTER, type Detectors, type FilterState } from "./types";

const TAPE = new URL("../../public/data-tape/", import.meta.url);
const tape = parseTape(JSON.parse(readFileSync(new URL("tape.json", TAPE), "utf8")));
const scan = parseScan(JSON.parse(readFileSync(new URL("scan.json", TAPE), "utf8")), tape);
const gates = availability(tape.detectors as Detectors, scan);
const select = (patch: Partial<FilterState>) => demoSelection(scan, selectBody({ ...DEFAULT_FILTER, ...patch }, gates, scan), tape.select.result);
const reasonOf = (result: ReturnType<typeof select>, rel: string) => result.rows.find((row) => row.rel_path === rel)?.keep_reason;
const recorded = (rel: string) => tape.select.result.rows.find((row) => row.rel_path === rel)?.keep_reason;

describe("demoSelection: the keep set for other filters, worked out from the tape", () => {
  it("gives back the curator's recorded keep set for the recorded request", () => {
    const mine = demoSelection(scan, tape.select.request, tape.select.result);
    expect(mine.kept).toBe(tape.select.result.kept);
    const recorded = new Map(tape.select.result.rows.map((row) => [row.rel_path, row.keep_reason]));
    for (const row of mine.rows) expect(row.keep_reason, row.rel_path).toBe(recorded.get(row.rel_path));
  });

  it("never lifts a reject, whatever the filters", () => {
    const loose = select({ minScore: 0, keepSimilar: true });
    const recorded = new Map(tape.select.result.rows.map((row) => [row.rel_path, row.keep_reason]));
    for (const image of scan.results.filter((one) => !one.passed)) expect(reasonOf(loose, image.rel_path)).toBe(recorded.get(image.rel_path));
    const duplicate = scan.results.find((image) => image.passed && image.is_duplicate && image.score >= 0);
    if (duplicate) expect(reasonOf(loose, duplicate.rel_path)).toBe(recorded.get(duplicate.rel_path) === "minor-exposed" ? "minor-exposed" : "");
  });

  it("names the filter that left a frame out, in the curator's words", () => {
    const kept = scan.results.find((image) => recorded(image.rel_path) === "")!;
    expect(reasonOf(select({ minScore: 1.01 }), kept.rel_path)).toBe("below-score");
    const unsafe = scan.results.find((image) => recorded(image.rel_path) === "" && image.guard && !image.guard.safe);
    if (unsafe) expect(reasonOf(select({ guardUnsafe: true }), unsafe.rel_path)).toMatch(/^guard-unsafe/);
    const safe = scan.results.find((image) => recorded(image.rel_path) === "" && Object.values(image.guard_variants ?? {}).every((verdict) => verdict?.safe) && image.guard?.safe);
    if (safe) expect(reasonOf(select({ guardUnsafe: true }), safe.rel_path)).toBe("");
    const environment = scan.results.find((image) => recorded(image.rel_path) === "" && image.scene)?.scene?.environment;
    if (environment) {
      const other = environment === "indoor" ? "outdoor" : "indoor";
      expect(select({ sceneEnvironments: [other] }).rows.some((row) => row.keep_reason === "scene-environment-excluded")).toBe(true);
    }
  });

  it("reads a frame with no face as missing its attributes once an age bound is set", () => {
    const noFace = scan.results.find((image) => image.passed && image.primary_face_attributes == null);
    if (noFace) expect(demoKeepReason(noFace, selectBody({ ...DEFAULT_FILTER, minAgeYears: 18 }, gates, scan), "")).toBe("face-attributes-missing");
  });
});
