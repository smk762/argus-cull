import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { insideRoot, parseXmp, readCaption } from "./captionStore";
import { autoTags, bandOf, cohortStats, effectiveTags, filterByTag, matchesPhrase, parseCohortConfig, type CohortConfig } from "./cohorts";
import { emptyLabel, labelsJsonl, type ImageLabel } from "./labels";
import type { GuardResult, ImageResult } from "./types";

const safe = (policy: string): GuardResult => ({ safe: true, rules: [], policy });
const unsafe = (policy: string): GuardResult => ({ safe: false, rules: ["A. Sexual Content Risk"], policy });

const CONFIG: CohortConfig = parseCohortConfig({
  scene_min_conf: 0.2,
  tags: [
    { tag: "classroom", group: "setting", scenes: ["classroom", "kindergarden_classroom"] },
    { tag: "library", group: "setting", scenes: ["library/indoor"], min_scene_conf: 0.5 },
    { tag: "school_uniform", group: "wardrobe", captions: ["school uniform", "schoolgirl", "plaid skirt"] },
    { tag: "lollipop", group: "prop", captions: ["lollipop", "lolly"] },
  ],
});

function image(rel: string, scene: [string, number][], extra: Partial<ImageResult> = {}): ImageResult {
  return {
    rel_path: rel,
    abs_path: `/data/images/${rel}`,
    scene: { categories: scene.map(([label, conf]) => ({ label, conf })), environment: "indoor", environment_conf: 0.9 },
    ...extra,
  } as unknown as ImageResult;
}

describe("cohorts.json", () => {
  it("validates the file and names the broken entry", () => {
    const repo = JSON.parse(readFileSync(path.resolve(__dirname, "../../../cohorts.json"), "utf8")) as unknown;
    const parsed = parseCohortConfig(repo);
    expect(parsed.tags.map((rule) => rule.tag)).toContain("classroom");
    expect(parsed.tags.map((rule) => rule.tag)).toContain("school_uniform");
    expect(() => parseCohortConfig({ tags: [{ tag: "x" }] })).toThrow("tags[0] needs scenes or captions");
    expect(() => parseCohortConfig({ tags: [{ tag: "a", scenes: ["b"] }, { tag: "a", scenes: ["c"] }] })).toThrow("repeats");
    expect(() => parseCohortConfig({ tags: [{ tag: "bad tag", scenes: ["b"] }] })).toThrow("tags[0].tag");
    expect(() => parseCohortConfig({ scene_min_conf: 2, tags: [] })).toThrow("scene_min_conf");
    expect(parseCohortConfig({ tags: [] })).toEqual({ scene_min_conf: 0.2, tags: [] });
  });

  it("matches caption phrases as whole words, across hyphens and case", () => {
    expect(matchesPhrase("She wears a School-Uniform today", "school uniform")).toBe(true);
    expect(matchesPhrase("school_uniform", "school uniform")).toBe(true);
    expect(matchesPhrase("preschool uniforms", "school uniform")).toBe(false);
    expect(matchesPhrase("a lolly in hand", "lolly")).toBe(true);
    expect(matchesPhrase("lollypop", "lolly")).toBe(false);
    expect(matchesPhrase("embraces", "braces")).toBe(false);
    expect(matchesPhrase("wearing braces.", "braces")).toBe(true);
  });

  it("tags from scene categories at the threshold and from caption text or keywords", () => {
    expect(autoTags(image("a.jpg", [["classroom", 0.21]]), null, CONFIG)).toEqual(["classroom"]);
    expect(autoTags(image("b.jpg", [["kindergarden_classroom", 0.19]]), null, CONFIG)).toEqual([]);
    expect(autoTags(image("c.jpg", [["library/indoor", 0.4]]), null, CONFIG)).toEqual([]);
    expect(autoTags(image("d.jpg", [["library/indoor", 0.5]]), null, CONFIG)).toEqual(["library"]);
    expect(autoTags(image("e.jpg", [["classroom", 0.6]]), { text: "A woman in a plaid skirt.", keywords: ["lollipop"] }, CONFIG)).toEqual(["classroom", "school_uniform", "lollipop"]);
    expect(autoTags({ scene: null }, { text: "", keywords: [] }, CONFIG)).toEqual([]);
  });

  it("lets a label's own list replace the automatic tags, including clearing them", () => {
    const auto = ["classroom"];
    expect(effectiveTags(auto, null)).toEqual(["classroom"]);
    expect(effectiveTags(auto, { tags: [] })).toEqual([]);
    expect(effectiveTags(auto, { tags: ["school_uniform"] })).toEqual(["school_uniform"]);
    expect(emptyLabel({ expect: null, tags: [] })).toBe(false);
    expect(emptyLabel({ expect: null })).toBe(true);
    const tags = new Map([
      ["a.jpg", ["classroom"]],
      ["b.jpg", []],
    ]);
    const images = [image("a.jpg", []), image("b.jpg", [])];
    expect(filterByTag(images, tags, "classroom").map((item) => item.rel_path)).toEqual(["a.jpg"]);
    expect(filterByTag(images, tags, null)).toHaveLength(2);
  });

  it("reads flag rates on tagged images against the rest, overall and by NudeNet band", () => {
    const nsfw = (score: number) => ({ nsfw: { detections: [], labels: {}, exposed_score: score } });
    const images = [
      image("a.jpg", [["classroom", 0.5]], { guard: unsafe("adult"), guard_variants: { adult: unsafe("adult"), "adult-cautious": unsafe("adult-cautious") }, ...nsfw(0.1) }),
      image("b.jpg", [["classroom", 0.5]], { guard: safe("adult"), guard_variants: { adult: safe("adult"), "adult-cautious": unsafe("adult-cautious") }, ...nsfw(0.7) }),
      image("c.jpg", [["beach", 0.9]], { guard: safe("adult"), guard_variants: { adult: safe("adult"), "adult-cautious": safe("adult-cautious") }, ...nsfw(0.1) }),
      image("d.jpg", [["beach", 0.9]], { guard: safe("adult"), guard_variants: { adult: safe("adult"), "adult-cautious": safe("adult-cautious") } }),
    ];
    const tags = new Map(images.map((item) => [item.rel_path, autoTags(item, null, CONFIG)]));
    const stats = cohortStats(images, tags, CONFIG, ["adult", "adult-cautious"]);
    expect(stats).toHaveLength(1);
    const [classroom] = stats;
    expect(classroom.tag).toBe("classroom");
    expect(classroom.images).toBe(2);
    expect(classroom.policies.map((entry) => entry.policy)).toEqual(["adult", "adult-cautious"]);
    const adult = classroom.policies[0];
    expect(adult.official).toBe(true);
    expect(adult.tagged).toEqual({ checked: 2, unsafe: 1 });
    expect(adult.rest).toEqual({ checked: 2, unsafe: 0 });
    expect(adult.bands.low.tagged).toEqual({ checked: 1, unsafe: 1 });
    expect(adult.bands.low.rest).toEqual({ checked: 1, unsafe: 0 });
    expect(adult.bands.high.tagged).toEqual({ checked: 1, unsafe: 0 });
    expect(adult.bands.unscored.rest).toEqual({ checked: 1, unsafe: 0 });
    const cautious = classroom.policies[1];
    expect(cautious.tagged).toEqual({ checked: 2, unsafe: 2 });
    expect(cautious.rest).toEqual({ checked: 2, unsafe: 0 });
    expect(bandOf({ nsfw: { detections: [], labels: {}, exposed_score: 0.2 } })).toBe("mid");
  });

  it("writes the effective tags into the labels JSONL", () => {
    const labels = new Map<string, ImageLabel>([["a.jpg", { expect: "adult", updated_at: "2026-01-01T00:00:00Z" }]]);
    const rows = labelsJsonl("/data/images/set", labels, new Map(), new Map([["a.jpg", ["classroom", "school_uniform"]]]));
    expect(JSON.parse(rows.trim()).tags).toEqual(["classroom", "school_uniform"]);
    const own = new Map<string, ImageLabel>([["a.jpg", { expect: "adult", tags: ["lollipop"], updated_at: "2026-01-01T00:00:00Z" }]]);
    expect(JSON.parse(labelsJsonl("/x", own).trim()).tags).toEqual(["lollipop"]);
  });
});

describe("caption sidecars", () => {
  it("keeps every read inside the source root", () => {
    expect(insideRoot("/data/images", "/data/images/a/b.jpg")).toBe("/data/images/a/b.jpg");
    expect(insideRoot("/data/images", "a/b.jpg")).toBe("/data/images/a/b.jpg");
    expect(insideRoot("/data/images", "/data/images/../etc/passwd")).toBeNull();
    expect(insideRoot("/data/images", "/data/images-other/x.jpg")).toBeNull();
    expect(insideRoot("/data/images", "/etc/passwd")).toBeNull();
    expect(insideRoot("/data/images", "a\0b.jpg")).toBeNull();
  });

  it("parses keywords and the description out of an XMP sidecar", () => {
    const xmp = `<x:xmpmeta><rdf:RDF><rdf:Description>
      <dc:subject><rdf:Bag><rdf:li>lollipop</rdf:li><rdf:li>plaid &amp; pleated</rdf:li></rdf:Bag></dc:subject>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">A woman in a school uniform.</rdf:li></rdf:Alt></dc:description>
    </rdf:Description></rdf:RDF></x:xmpmeta>`;
    expect(parseXmp(xmp)).toEqual({ keywords: ["lollipop", "plaid & pleated"], description: "A woman in a school uniform." });
    expect(parseXmp("not xmp")).toEqual({ keywords: [], description: "" });
  });

  it("reads the .txt and .xmp next to an image and returns null without either", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cull-captions-"));
    await mkdir(path.join(root, "set"));
    await writeFile(path.join(root, "set", "a.jpg"), "");
    await writeFile(path.join(root, "set", "a.txt"), "A woman at a desk in a classroom.\n");
    await writeFile(path.join(root, "set", "a.xmp"), "<dc:subject><rdf:li>backpack</rdf:li></dc:subject>");
    await writeFile(path.join(root, "set", "b.jpg"), "");
    const found = await readCaption(root, path.join(root, "set", "a.jpg"));
    expect(found).toEqual({ text: "A woman at a desk in a classroom.", keywords: ["backpack"] });
    expect(await readCaption(root, path.join(root, "set", "b.jpg"))).toBeNull();
    expect(await readCaption(root, path.join(root, "..", "a.jpg"))).toBeNull();
    expect(await readFile(path.join(root, "set", "a.txt"), "utf8")).toContain("classroom");
  });
});
