// The veil (lib/veil.ts): why a frame is veiled, in plain words, which mosaic it shows,
// and that a veiled frame never names its thumbnail or full view. Runs against the committed tape.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_BLUR, shouldBlur } from "./chunks";
import { parseScan, parseTape, replaySteps, tapeFileUrl, tapeVeilUrl } from "./tape";
import { mergeChunk } from "./chunks";
import type { ImageResult, ScanSummary } from "./types";
import { frameSource, policyLine, reasonTitle, rejectWords, tileVerdict, VEIL_CELLS, veilFor, watermarkBoxes } from "./veil";

const TAPE = new URL("../../public/data-tape/", import.meta.url);
const readTape = (name: string) => JSON.parse(readFileSync(new URL(name, TAPE), "utf8")) as unknown;
const tape = parseTape(readTape("tape.json"));
const scan = parseScan(readTape("scan.json"), tape);
const frame = (name: string): ImageResult => scan.results.find((image) => image.rel_path.endsWith(name))!;

describe("rejectWords", () => {
  it("puts each reject reason in plain words, keeping the curator's code", () => {
    const overlay = rejectWords("crop:overlay (1 watermark(s) no edge cut of 15% removes)");
    expect(overlay.headline).toBe("Held: not safety-checked");
    expect(overlay.detail).toBe(
      "Rejected for a watermark the edge crop couldn't remove (crop:overlay), so the curator never ran the nudity or age checks. Unchecked frames are never shown.",
    );
    expect(rejectWords("crop:unchecked (watermark detector failed)").detail).toMatch(/^Rejected for a watermark check that couldn't run \(crop:unchecked\)/);
    expect(rejectWords("crop:invalid (empty box 0,0,0,0)").short).toMatch(/crop:invalid/);
    expect(rejectWords("blurry (sharpness=3.9 < 100.0)").detail).toMatch(/^Rejected for blur: sharpness 3.9, below the 100.0 floor, so/);
    expect(rejectWords("resolution too low (160px short side)").detail).toMatch(/^Rejected for low resolution: 160 px on the short side, so/);
    expect(rejectWords("aspect ratio 5.00 > 3.0").detail).toMatch(/^Rejected for its shape: an aspect ratio of 5.00, over the 3.0 limit, so/);
    expect(rejectWords("similar-to:personA/A_cafe.jpg").short).toBe("Near-duplicate of A_cafe.jpg");
    expect(rejectWords("prefilter:no-face").headline).toBe("Held: dropped before the slow checks");
    expect(rejectWords("prefilter:nsfw").detail).toMatch(/exposed reading of 0.2 or more \(prefilter:nsfw\)/);
    expect(rejectWords("blurry (sharpness=3.9 < 100.0)").short).toBe("Blurry: sharpness 3.9 < 100.0");
    expect(rejectWords("resolution too low (160px short side)").short).toBe("Low resolution: 160 px short side");
    expect(rejectWords("crop:overlay (1 watermark(s))").short).toBe("Watermark the edge crop couldn't remove (crop:overlay)");
    expect(rejectWords("below-score").short).toBe("Quality under the minimum");
    expect(rejectWords("something new").detail).toMatch(/\(something new\)/);
  });

  it("gives a tooltip with the plain words first, without repeating an unknown reason", () => {
    expect(reasonTitle("aspect ratio 5.00 > 3.0")).toBe("Aspect ratio 5.00 > 3.0. Curator: aspect ratio 5.00 > 3.0");
    expect(reasonTitle("odd")).toBe("odd");
  });
});

describe("veilFor on the recorded scan", () => {
  it("holds the watermark false positive at the medium strength, with no unblur", () => {
    const veil = veilFor(frame("B_park.jpg"), [], DEFAULT_BLUR)!;
    expect(veil).toMatchObject({ kind: "held", strength: "medium", chip: "Held", headline: "Held: not safety-checked", unblur: false });
    expect(veil.detail).toMatch(/crop:overlay/);
  });

  it("veils the NudeNet and policy flags at the same strength, with unblur and a short reason", () => {
    const nude = veilFor(frame("E_locker_room.jpg"), [], DEFAULT_BLUR)!;
    expect(nude).toMatchObject({ kind: "nudenet", strength: "medium", chip: "Veiled: NudeNet", unblur: true });
    expect(nude.detail).toMatch(/^NudeNet: [a-z ]+ exposed 0\.39\./);
    expect(nude.short).toMatch(/^NudeNet: [a-z ]+ exposed 0\.39$/);
    const weapon = veilFor(frame("D_action_film.jpg"), [], DEFAULT_BLUR)!;
    expect(weapon).toMatchObject({ kind: "policy", strength: "medium", chip: "Veiled: policy", unblur: true });
    expect(weapon.detail).toMatch(/flagged rule B \(Real-World Crimes & Public Safety\)\. Frames a policy flags stay veiled until you unblur\.$/);
    expect(weapon.short).toBe("Policy: rule B (Real-World Crimes & Public Safety)");
  });

  it("is null exactly when shouldBlur is false, for every frame at every replay step", () => {
    let summary: ScanSummary | null = null;
    for (const step of replaySteps(scan)) {
      if (step.chunk) summary = mergeChunk(summary, step.chunk);
      const pending = step.progress.pending_checks ?? [];
      for (const image of summary?.results ?? []) {
        expect(veilFor(image, pending, DEFAULT_BLUR) != null, image.rel_path).toBe(shouldBlur(image, pending, DEFAULT_BLUR));
      }
    }
  });

  it("holds an unscored frame while NudeNet runs, and an under-18 exposed one, at the one strength", () => {
    const unscored = { ...frame("A_cafe.jpg"), nsfw: null };
    expect(veilFor(unscored, ["nsfw"], DEFAULT_BLUR)).toMatchObject({ kind: "scanning", strength: "medium", chip: null, unblur: false, headline: "Held: still scanning" });
    const base = frame("E_locker_room.jpg");
    const minor = { ...base, faces: base.faces!.map((face) => ({ ...face, attributes: { ...face.attributes!, age_years: 16 } })) };
    expect(veilFor(minor, [], { ...DEFAULT_BLUR, unblurNsfw: true })).toMatchObject({ kind: "minor", strength: "medium", unblur: false });
  });

  it("names the policy and rule that flagged", () => {
    const image = frame("A_noir_detective.jpg");
    expect(policyLine(image)).toMatch(/^Adult and 2 more policies flagged rule B/);
    expect(policyLine(image, "adult-granular")).toMatch(/^The adult-granular policy flagged rule B/);
  });
});

describe("watermarkBoxes", () => {
  it("outlines the detected watermark on a crop reject, as fractions of the frame", () => {
    const [box, ...rest] = watermarkBoxes(frame("B_park.jpg"));
    expect(rest).toHaveLength(0);
    expect(box[0]).toBeCloseTo(415.1 / 832, 4);
    expect(box[1]).toBeCloseTo(1024 / 1216, 4);
    expect(box[3]).toBeCloseTo(192 / 1216, 4);
  });

  it("draws none on a kept frame, even one with watermark hits", () => {
    expect(watermarkBoxes(frame("A_street.jpg"))).toEqual([]);
    expect(watermarkBoxes(frame("D_cafe_watermark.jpg"))).toEqual([]);
  });
});

describe("frameSource: a veiled frame never requests its thumbnail or full view", () => {
  const urls = { veil: (strength: string) => `/v/${strength}.webp`, thumb: "/thumb.webp", image: "/image.webp" };

  it("uses the tape's veil when there is one", () => {
    for (const view of ["tile", "detail"] as const) {
      expect(frameSource({ strength: "medium" }, urls, view)).toEqual({ kind: "veil", url: "/v/medium.webp", cells: VEIL_CELLS.medium });
    }
  });

  it("live, draws the mosaic from the thumbnail and never names the full view", () => {
    const live = { ...urls, veil: () => null };
    for (const view of ["tile", "detail"] as const) {
      const source = frameSource({ strength: "medium" }, live, view);
      expect(source.kind).toBe("mosaic");
      expect(JSON.stringify(source)).not.toContain("/image.webp");
    }
  });

  it("names the real renditions only once the frame shows", () => {
    expect(frameSource(null, urls, "tile")).toEqual({ kind: "image", url: "/thumb.webp" });
    expect(frameSource(null, urls, "detail")).toEqual({ kind: "image", url: "/image.webp" });
  });

  it("on the tape, every veiled frame's source is its veil file, which exists", () => {
    for (const image of scan.results) {
      const veil = veilFor(image, [], DEFAULT_BLUR);
      if (!veil) continue;
      const tapeUrls = {
        veil: (strength: "medium") => tapeVeilUrl("", tape, image.rel_path, strength),
        thumb: tapeFileUrl("", tape, "thumbs", image.rel_path),
        image: tapeFileUrl("", tape, "images", image.rel_path),
      };
      for (const view of ["tile", "detail"] as const) {
        const source = frameSource(veil, tapeUrls, view, tape.veils!);
        expect(source.kind, image.rel_path).toBe("veil");
        if (source.kind !== "veil") continue;
        expect(source.url).toMatch(/^\/veils\/[a-f0-9]+-medium\.webp$/);
        expect(existsSync(new URL(source.url.slice(1), TAPE)), source.url).toBe(true);
      }
    }
  });
});

describe("veil cell counts", () => {
  it("match between the page, the recorder and the committed tape", () => {
    const script = readFileSync(new URL("../../../scripts/record_tape.py", import.meta.url), "utf8");
    const match = /VEIL_CELLS = \{"medium": (\d+)\}/.exec(script);
    expect(match && { medium: Number(match[1]) }).toEqual(VEIL_CELLS);
    // The one strength the page asks for; an older tape also carries a coarse set, which it ignores.
    expect(tape.veils?.medium).toBe(VEIL_CELLS.medium);
  });

  it("an older tape with no veils gives no veil URL", () => {
    const rel = scan.results[0].rel_path;
    expect(tapeVeilUrl("/t", { files: tape.files }, rel, "medium")).toBeNull();
    expect(tapeVeilUrl("/t", tape, rel, "medium")).toBe(`/t/veils/${tape.files[rel]}-medium.webp`);
  });
});

describe("rejectWords: a sidebar filter's keep reason", () => {
  it("names the filter in a few words, with the policy where the curator gives one", () => {
    expect(rejectWords("guard-unsafe:adult")).toMatchObject({ headline: "Left out: filtered", short: "Unsafe verdict (adult)" });
    expect(rejectWords("guard-rule-b:adult-granular").short).toBe("Policy rule B fired (adult-granular)");
    expect(rejectWords("scene-environment-excluded").short).toBe("Environment not ticked");
    expect(rejectWords("content-rating:suggestive").short).toBe("Rated suggestive");
    expect(rejectWords("face-age-out-of-range").detail).toBe("A sidebar filter left it out (face-age-out-of-range).");
  });
});

describe("tileVerdict: the grid chip and its colour", () => {
  const veiled = (name: string) => veilFor(frame(name), [], DEFAULT_BLUR);

  it("says Keep (success) for a shown frame in the keep set", () => {
    const shown = frame("A_cafe.jpg");
    expect(tileVerdict(shown, "", veilFor(shown, [], DEFAULT_BLUR))).toEqual({ chip: "Keep", tone: "keep", title: "In the keep set", line: null });
  });

  it("says Left out (neutral) with the plain reason as a line, for a near-duplicate or low score", () => {
    const shown = frame("A_cafe.jpg");
    expect(tileVerdict(shown, "similar-to:personA/A_cafe.jpg", null)).toMatchObject({ chip: "Left out", tone: "left-out", line: "Near-duplicate of A_cafe.jpg" });
    expect(tileVerdict(shown, "below-score", null)).toMatchObject({ chip: "Left out", tone: "left-out", line: "Quality under the minimum" });
  });

  it("says Held (danger) for a reject, with the reason on the frame rather than a line", () => {
    const image = frame("B_park.jpg");
    expect(tileVerdict(image, image.reject_reason, veiled("B_park.jpg"))).toEqual({ chip: "Held", tone: "held", title: "Held: not safety-checked", line: null });
  });

  it("says Held for a reject that is somehow shown, with the reason as a line", () => {
    expect(tileVerdict({ passed: false }, "blurry (sharpness=3.9 < 100.0)", null)).toMatchObject({ chip: "Held", tone: "held", line: "Blurry: sharpness 3.9 < 100.0" });
  });

  it("says Veiled · Keep (warn) for a policy or NudeNet veil in the keep set; the frame's panel says why", () => {
    expect(tileVerdict(frame("E_locker_room.jpg"), "", veiled("E_locker_room.jpg"))).toEqual({ chip: "Veiled · Keep", tone: "veiled", line: null, title: "Veiled: NudeNet. In the keep set" });
    expect(tileVerdict(frame("D_action_film.jpg"), "", veiled("D_action_film.jpg"))).toMatchObject({ chip: "Veiled · Keep", tone: "veiled", title: "Veiled: policy. In the keep set" });
  });

  it("says Left out (neutral) for a veiled frame the keep set leaves out, with the veil and the reason in the tooltip", () => {
    expect(tileVerdict(frame("D_action_film.jpg"), "below-score", veiled("D_action_film.jpg"))).toEqual({
      chip: "Left out",
      tone: "left-out",
      title: "Veiled: policy. Left out: Quality under the minimum",
      line: "Quality under the minimum",
    });
  });

  it("names the veil alone before the keep set exists", () => {
    expect(tileVerdict(frame("D_action_film.jpg"), undefined, veiled("D_action_film.jpg"))).toMatchObject({ chip: "Veiled: policy", tone: "veiled", title: "Veiled: policy" });
  });

  it("shows no chip while the tile says Scanning…, or before a shown frame is selected", () => {
    const unscored = { ...frame("A_cafe.jpg"), nsfw: null };
    expect(tileVerdict(unscored, "", veilFor(unscored, ["nsfw"], DEFAULT_BLUR))).toBeNull();
    expect(tileVerdict(frame("A_cafe.jpg"), undefined, null)).toBeNull();
  });

  it("gives every recorded frame a chip once the keep set exists", () => {
    const reasons = new Map(tape.select.result.rows.map((row) => [row.rel_path, row.keep_reason]));
    for (const image of scan.results) {
      const verdict = tileVerdict(image, reasons.get(image.rel_path), veilFor(image, [], DEFAULT_BLUR));
      expect(verdict, image.rel_path).not.toBeNull();
    }
  });
});
