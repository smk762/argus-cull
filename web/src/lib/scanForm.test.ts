import { describe, expect, it } from "vitest";

import { measuredAges, shownAge } from "./chunks";
import { confLine, nsfwSource, nudeNetLine, qualityLine, sceneLine } from "./detailLines";
import { policiesRun, withoutPolicies } from "./policies";
import { runStats, runStatsFilename } from "./runStats";
import { templateFromRunStats, templateFromSummary, templateFromView, templateSummary, viewWithTemplate } from "./scanTemplate";
import { ago } from "./time";
import { DEFAULT_VIEW, type Detectors, type FaceAttributes, type ImageResult, type ScanSummary, type SelectRequest, type SelectResult } from "./types";

const DETECTORS: Detectors = {
  torch: true,
  cuda: true,
  clip: false,
  insightface: true,
  onnxruntime: true,
  fairface: false,
  mivolo: true,
  places365: true,
  garments: true,
  nudenet: true,
  singguard: true,
  singguard_policies: ["default", "adult", "adult-v2"],
};

function image(rel: string, extra: Partial<ImageResult> = {}): ImageResult {
  return {
    rel_path: rel,
    abs_path: `/data/set/${rel}`,
    score: 0.8,
    passed: true,
    reject_reason: null,
    similar_group: 1,
    group_size: 1,
    is_representative: true,
    is_duplicate: false,
    duplicate_of: null,
    keep_reason: "",
    sharpness: 350.4,
    width: 2000,
    height: 3000,
    face_count: 0,
    primary_face_cluster: null,
    primary_face_pose: null,
    primary_face_attributes: null,
    scene: null,
    garments: null,
    ...extra,
  };
}

function mivolo(years: number): FaceAttributes {
  return { gender: "female", gender_conf: 0.9, gender_source: "mivolo", age: null, age_conf: null, age_years: years, age_source: "mivolo" };
}

function faced(rel: string, years: number, extra: Partial<ImageResult> = {}): ImageResult {
  return image(rel, { face_count: 1, primary_face_cluster: "face_1", primary_face_attributes: mivolo(years), ...extra });
}

const SET_AGE = { years: 19.6, cluster_id: "face_1", faces: 3, share: 1 };

const SUMMARY: ScanSummary = {
  scan_id: "abcdef1234567890",
  folder: "/data/images/adult/one set",
  faces_config: { enabled: true, fairface: false, mivolo: true, set_age: true },
  scenes_config: { enabled: true },
  garments_config: { enabled: false, min_conf: 0.3 },
  nsfw_config: { enabled: true },
  guard_config: { enabled: true, policy: "adult", variants: ["adult-v2"] },
  total: 5,
  passed: 4,
  rejected: 1,
  duplicates: 0,
  face_clusters: [],
  set_age: SET_AGE,
  results: [
    faced("01.jpg", 18, {
      nsfw: { detections: [], labels: { FEMALE_BREAST_EXPOSED: 0.9 }, exposed_score: 0.9 },
      guard: { safe: true, rules: [], policy: "adult" },
      guard_variants: { "adult-v2": { safe: false, rules: ["A. Illegal or Extreme Sexual Content"] } },
      scene: { categories: [{ label: "bedroom", conf: 0.6 }], environment: "indoor", environment_conf: 0.9 },
    }),
    faced("02.jpg", 20, { nsfw: { detections: [], labels: {}, exposed_score: 0 }, guard: { safe: true, rules: [], policy: "adult" } }),
    faced("03.jpg", 22, { nsfw: { detections: [], labels: {}, exposed_score: 0.3 }, guard: { safe: false, rules: ["A. Illegal or Extreme Sexual Content"], policy: "adult" } }),
    image("04.jpg", { set_age: SET_AGE, nsfw: { detections: [], labels: { BUTTOCKS_EXPOSED: 0.5 }, exposed_score: 0.5 }, guard: { safe: true, rules: [], policy: "adult" } }),
    image("05.jpg", { passed: false, reject_reason: "blur", score: 0.1, nsfw: { detections: [], labels: {}, exposed_score: 0 } }),
  ],
};

const NO_TAGS = { scene_min_conf: 0.2, tags: [] };

describe("shown age", () => {
  it("is always the youngest face", () => {
    // Primary 43, a second face 28: the tile says 28 and the tooltip names the primary.
    const two = faced("a.jpg", 43, { face_count: 2, faces: [{ primary: true, attributes: mivolo(43) }, { attributes: mivolo(28) }] });
    expect(shownAge(two)).toEqual({ text: "28.0y", title: "Youngest of 2 faces, MiVOLO. The primary face reads 43.0y." });
    // The face list carries the primary face, so it is not counted twice; a record with no list has the primary alone.
    expect(measuredAges(two)).toEqual([43, 28]);
    expect(measuredAges(faced("one.jpg", 30))).toEqual([30]);
    expect(measuredAges(faced("old.jpg", 30, { faces: [{ attributes: mivolo(25) }] }))).toEqual([30, 25]);
    // A primary that is the youngest is just the age.
    const young = faced("b.jpg", 20, { face_count: 2, faces: [{ primary: true, attributes: mivolo(20) }, { attributes: mivolo(35) }] });
    expect(shownAge(young)).toEqual({ text: "20.0y", title: "Youngest of 2 faces, MiVOLO" });
    expect(shownAge(faced("c.jpg", 31.4))).toEqual({ text: "31.4y", title: "Apparent age, MiVOLO years" });
    // One decimal, cut off: a reading the under-18 rule calls a minor never shows as 18.
    expect(shownAge(faced("d.jpg", 17.96))?.text).toBe("17.9y");
    // No face: the set's age when the scan gave one, else nothing.
    expect(shownAge(image("d.jpg", { set_age: SET_AGE }))?.text).toBe("≈19.6y set");
    expect(shownAge(image("e.jpg"))).toBeNull();
    // Only FairFace ran: its bracket stands in.
    expect(shownAge(image("f.jpg", { face_count: 1, primary_face_attributes: { ...mivolo(0), age_years: null, age_source: "fairface", age: "20-29" } }))).toEqual({ text: "20-29", title: "FairFace age bracket of the primary face" });
  });
});

describe("scan template", () => {
  it("reads the form back out of a finished scan", () => {
    const template = templateFromSummary(SUMMARY, "/data/images", DETECTORS);
    expect(template).toEqual({ folder: "adult/one set", policy: { policy: "adult", variants: ["adult-v2"] }, withGarments: false, setAge: true, readBodies: false, drops: [], cropWatermarks: false, cropMaxCut: 17 });
    // A scan that ran garments runs them again; one with no recorded policy takes the picker's default.
    const plain = { ...SUMMARY, garments_config: { enabled: true, min_conf: 0.3 }, guard_config: { enabled: false }, faces_config: { enabled: true, fairface: true, mivolo: true } };
    expect(templateFromSummary(plain, "/data/images/", DETECTORS)).toEqual({ folder: "adult/one set", policy: { policy: "adult", variants: [] }, withGarments: true, setAge: false, readBodies: false, drops: [], cropWatermarks: false, cropMaxCut: 17 });
    // The curator writes a policy name even when SingGuard was off; that is not a choice to repeat.
    const off: ScanSummary = { ...SUMMARY, guard_config: { enabled: false, policy: "default" } };
    expect(templateFromSummary(off, "/data/images", DETECTORS).policy).toEqual({ policy: "adult", variants: [] });
    // The root itself is the empty folder; an unknown root leaves the path as the curator gave it.
    expect(templateFromSummary({ ...SUMMARY, folder: "/data/images" }, "/data/images", DETECTORS).folder).toBe("");
    expect(templateFromSummary(SUMMARY, null, DETECTORS).folder).toBe("/data/images/adult/one set");
  });

  it("round-trips through the view", () => {
    const template = templateFromSummary(SUMMARY, "/data/images", DETECTORS);
    const before = { ...DEFAULT_VIEW, scan: "old", page: 3, photo: "x.jpg", cluster: "face_2", view: "people" as const, filter: { ...DEFAULT_VIEW.filter, faceClusters: ["face_2"], scenes: ["bedroom"], minScore: 0.3 } };
    const view = viewWithTemplate(before, template);
    expect(view).toMatchObject({ scan: null, page: 1, photo: null, cluster: null, view: "grid" });
    // Filters tied to the old scan go; the score floor stays.
    expect(view.filter.faceClusters).toEqual([]);
    expect(view.filter.scenes).toEqual([]);
    expect(view.filter.minScore).toBe(0.3);
    expect(templateFromView(view, DETECTORS)).toEqual(template);
    // A URL that names no policy shows the default in the form.
    expect(templateFromView(DEFAULT_VIEW, DETECTORS).policy).toEqual({ policy: "adult", variants: [] });
    expect(templateFromView(DEFAULT_VIEW, null).policy).toEqual({ policy: "adult", variants: [] });
  });

  it("names what a template runs", () => {
    expect(templateSummary(templateFromSummary(SUMMARY, "/data/images", DETECTORS), DETECTORS)).toBe("adult + adult-v2 · set age");
    expect(templateSummary({ folder: "", policy: { policy: "default", variants: [] }, withGarments: true, setAge: false, readBodies: false, drops: [], cropWatermarks: false, cropMaxCut: 17 }, DETECTORS)).toBe("default · garments");
    expect(templateSummary({ folder: "", policy: { policy: "default", variants: [] }, withGarments: true, setAge: false, readBodies: false, drops: [], cropWatermarks: false, cropMaxCut: 17 }, { ...DETECTORS, garments: false, singguard_policies: [] })).toBe("");
  });
});

describe("run stats", () => {
  const stats = runStats(
    SUMMARY,
    {
      scan_id: SUMMARY.scan_id,
      total: 5,
      kept: 2,
      rows: [
        { rel_path: "01.jpg", abs_path: "", keep_reason: "" },
        { rel_path: "02.jpg", abs_path: "", keep_reason: "" },
        { rel_path: "03.jpg", abs_path: "", keep_reason: "guard_unsafe" },
        { rel_path: "04.jpg", abs_path: "", keep_reason: "similar-to:01.jpg" },
        { rel_path: "05.jpg", abs_path: "", keep_reason: "rejected" },
      ],
    },
    new Map([["03.jpg", { expect: "adult" as const, tags: ["lingerie"], updated_at: "" }]]),
    new Map([
      ["01.jpg", ["bedroom"]],
      ["03.jpg", ["lingerie"]],
    ]),
    {
      scene_min_conf: 0.2,
      tags: [
        { tag: "bedroom", group: "setting", scenes: ["bedroom"], captions: [] },
        { tag: "lingerie", group: "wardrobe", scenes: [], captions: ["lingerie"] },
      ],
    },
    ["adult", "adult-v2"],
    new Date("2026-10-27T12:00:00Z"),
  );

  it("counts pass and fail, and the keep set under the filters", () => {
    expect(stats.config).toEqual({ faces: true, fairface: false, mivolo: true, set_age: true, mivolo_body: false, scenes: true, garments: false, nsfw: true, guard: true, policy: "adult", variants: ["adult-v2"], prefilter: null, crop_watermarks: false, crop_max_cut: null });
    // similar-to:<file> is one reason, not one per file.
    expect(stats.images).toEqual({ total: 5, passed: 4, rejected: 1, duplicates: 0, reject_reasons: { blur: 1 }, kept: 2, left_out: 3, left_out_reasons: { guard_unsafe: 1, "similar-to": 1, rejected: 1 }, prefiltered: {}, cropped: {}, watermarked: 0 });
    // A selection from another scan does not count.
    expect(runStats(SUMMARY, { scan_id: "other", total: 0, kept: 0, rows: [] }, new Map(), new Map(), NO_TAGS, []).images.kept).toBeNull();
    // A scan that ran without SingGuard records a policy name all the same; it judged nothing, so nothing is reported for it.
    const off: ScanSummary = { ...SUMMARY, guard_config: { enabled: false, policy: "default" }, results: SUMMARY.results.map((img) => ({ ...img, guard: undefined, guard_variants: undefined })) };
    const quiet = runStats(off, null, new Map(), new Map(), NO_TAGS, ["default"]);
    expect(quiet.config).toMatchObject({ guard: false, policy: null, variants: [] });
    expect(quiet.policies).toEqual([]);
  });

  it("records watermark crops and counts the frames they touched", () => {
    const hit = { label: "watermark", score: 0.9, bbox: [0, 0, 10, 10] };
    const cropped: ScanSummary = {
      ...SUMMARY,
      crop_config: { enabled: true, detect: true },
      results: SUMMARY.results.map((img, i) =>
        i === 0 ? { ...img, crop: { left: 0, top: 0, right: 10, bottom: 10 }, crop_source: "detected" as const, watermarks: [hit] } : i === 1 ? { ...img, watermarks: [hit] } : { ...img, watermarks: [] },
      ),
    };
    const out = runStats(cropped, null, new Map(), new Map(), NO_TAGS, []);
    expect(out.config.crop_watermarks).toBe(true);
    expect(out.images.cropped).toEqual({ detected: 1 });
    expect(out.images.watermarked).toBe(2);
    expect(templateFromSummary(cropped, "/data/images", DETECTORS).cropWatermarks).toBe(true);
    // The limit comes back as the percent it ran with, through a summary and through a run file.
    const deep = { ...cropped, crop_config: { enabled: true, detect: true, max_cut: 0.25 } };
    expect(templateFromSummary(deep, "/data/images", DETECTORS).cropMaxCut).toBe(25);
    expect(runStats(deep, null, new Map(), new Map(), NO_TAGS, []).config.crop_max_cut).toBe(0.25);
    expect(templateFromRunStats(JSON.parse(JSON.stringify(runStats(deep, null, new Map(), new Map(), NO_TAGS, []))), "/data/images", DETECTORS).template.cropMaxCut).toBe(25);
  });

  it("tallies crop rejects by kind, without the curator's per-image detail", () => {
    const reasons = ["crop:overlay (2 watermark(s) no edge cut of 15% removes)", "crop:overlay (3 watermark(s) no edge cut of 15% removes)", "crop:unchecked (HTTP 500)"];
    const rejected: ScanSummary = { ...SUMMARY, results: reasons.map((reason, i) => ({ ...SUMMARY.results[0], rel_path: `${i}.jpg`, passed: false, reject_reason: reason })) };
    const selection = { scan_id: SUMMARY.scan_id, total: 3, kept: 0, rows: reasons.map((reason, i) => ({ rel_path: `${i}.jpg`, keep: false, keep_reason: reason })) };
    const out = runStats(rejected, selection as unknown as SelectResult, new Map(), new Map(), NO_TAGS, []);
    expect(out.images.reject_reasons).toEqual({ "crop:overlay": 2, "crop:unchecked": 1 });
    expect(out.images.left_out_reasons).toEqual({ "crop:overlay": 2, "crop:unchecked": 1 });
  });

  it("carries watermark crops only to a curator with a detector, and says so", () => {
    const file = { ...JSON.parse(JSON.stringify(stats)), config: { ...stats.config, crop_watermarks: true } };
    expect(templateFromRunStats(file, "/data/images", { ...DETECTORS, watermark: true })).toMatchObject({ template: { cropWatermarks: true }, notes: [] });
    const without = templateFromRunStats(file, "/data/images", { ...DETECTORS, watermark: false });
    expect(without.template.cropWatermarks).toBe(false);
    expect(without.notes.join(" ")).toContain("no watermark detector");
    const template = { ...without.template, cropWatermarks: true };
    expect(templateSummary(template, { ...DETECTORS, watermark: true })).toContain("crop watermarks");
    expect(templateSummary(template, { ...DETECTORS, watermark: false })).not.toContain("crop watermarks");
  });

  it("reads the ages, measured and set", () => {
    expect(stats.age).toEqual({
      frames_with_face_age: 3,
      frames_with_body_age_only: 0,
      frames_with_set_age: 1,
      frames_without_age: 1,
      frames_without_face: 2,
      faces_measured: 3,
      mean_years: 20,
      median_years: 20,
      min_years: 18,
      max_years: 22,
      frames_under_18: 0,
      frames_minor_exposed: 0,
      frames_under_18_not_exposed: 0,
      frames_16_to_18: 0,
      youngest_from: { face: 3, body: 0, set: 1 },
      people_check: {},
      set_age: SET_AGE,
      set_age_skipped: null,
    });
    const young = runStats({ ...SUMMARY, results: [faced("a.jpg", 16, { nsfw: { detections: [], labels: { FEMALE_BREAST_EXPOSED: 0.4 }, exposed_score: 0.4 } }), faced("b.jpg", 17)] }, null, new Map(), new Map(), NO_TAGS, []);
    expect(young.age.frames_under_18).toBe(2);
    expect(young.age.frames_minor_exposed).toBe(1);
  });

  it("bands NudeNet and rates each policy", () => {
    expect(stats.nudenet).toMatchObject({ scored: 5, mean_exposed: 0.34, bands: { low: 2, mid: 1, high: 2, unscored: 0 } });
    expect(stats.nudenet.source).toEqual({ nudenet: 5, erax_filled: 0, erax_only: 0, unscored: 0 });
    expect(stats.policies.map((entry) => [entry.policy, entry.unchecked, entry.slow_overrode_fast])).toEqual([
      ["adult", 1, 0],
      ["adult-v2", 4, 0],
    ]);
    expect(stats.policies.map((entry) => [entry.policy, entry.official, entry.checked, entry.unsafe, entry.flag_rate])).toEqual([
      ["adult", true, 4, 1, "25%"],
      ["adult-v2", false, 1, 1, "100%"],
    ]);
    expect(stats.policies[1].agreement).toEqual({ both: 0, only_official: 0, only_this: 1, neither: 0 });
    // The one label is adult, so the flag on 03 is a false positive.
    expect(stats.policies[0]).toMatchObject({ labelled: 1, precision: "0%", recall: "–", fp: 1 });
    expect(stats.policies[1].precision).toBeNull();
  });

  it("records what produced the numbers, and summarises verdicts, content, labels and blur", () => {
    expect(stats.versions).toEqual({ curator: null, cull: null });
    expect(stats.display).toEqual({ blur_exposed_score: 0.25, policy_blur: true });
    // 01 passes the official policy and a variant flags it: split. 05 has no verdict.
    expect(stats.verdicts).toEqual({ unsafe: 1, split: 1, safe: 2, none: 1, official_safe_variant_flagged: 1 });
    expect(stats.content).toMatchObject({ scenes: { bedroom: 1 }, environments: { indoor: 1 } });
    expect(stats.labels).toEqual({ labelled: 1, by_expect: { adult: 1 }, overrides: 0, tagged_by_hand: 1 });
    // 01, 03 and 04 score at or above 0.25 and Unblur reveals them; 05 is rejected, so it is held whatever Unblur says.
    expect(stats.blur).toEqual({ blurred: 4, reasons: { held_minor_or_pending: 1, nudenet_score: 3, erax_only: 0, policy: 0 }, with_unblur: 1 });

    const filters = { min_score: 0.4, min_scene_conf: 0.7 } as unknown as SelectRequest;
    const withContext = runStats(SUMMARY, { scan_id: SUMMARY.scan_id, total: 5, kept: 5, rows: [] }, new Map(), new Map(), NO_TAGS, [], new Date(), {
      curatorVersion: "0.11.1",
      cullVersion: "0.2.0",
      filters,
      blur: { exposedScore: 0.6, policyBlur: false },
    });
    expect(withContext.versions).toEqual({ curator: "0.11.1", cull: "0.2.0" });
    expect(withContext.filters).toBe(filters);
    // Scene counts follow the filters' confidence: bedroom read 0.6, under 0.7.
    expect(withContext.content.scenes).toEqual({});
    expect(withContext.blur).toMatchObject({ blurred: 2, reasons: { held_minor_or_pending: 1, nudenet_score: 1 } });
  });

  it("counts EraX sources, under-18 near the line, and cascade overrides", () => {
    const exposed = { detections: [], labels: { FEMALE_BREAST_EXPOSED: 0.5 }, exposed_score: 0.5 };
    const results = [
      faced("a.jpg", 17.2, { nsfw: exposed, nudenet_failed: true }),
      faced("b.jpg", 16.5, { nsfw: { detections: [], labels: {}, exposed_score: 0 }, erax_filled: true, guard: { safe: false, rules: ["Safe"], policy: "adult" } }),
      faced("c.jpg", 30, { nsfw: { detections: [], labels: {}, exposed_score: 0 }, guard: { safe: false, rules: ["A. Sexual Content Risk"], policy: "adult" } }),
    ];
    const run = runStats({ ...SUMMARY, results }, null, new Map(), new Map(), NO_TAGS, ["adult"]);
    expect(run.nudenet.source).toEqual({ nudenet: 1, erax_filled: 1, erax_only: 1, unscored: 0 });
    expect(run.nudenet.minor_exposed_on_erax_only).toBe(1);
    expect(run.age).toMatchObject({ frames_under_18: 2, frames_minor_exposed: 1, frames_under_18_not_exposed: 1, frames_16_to_18: 2 });
    // b's flag names only "Safe", so the slower reading stands: safe, and counted as an override.
    expect(run.policies[0]).toMatchObject({ checked: 2, unchecked: 1, unsafe: 1, slow_overrode_fast: 1, rules_only_safe: 1 });
    // a is held (under 18, exposed); c is blurred by its policy verdict; b's flag turned safe, so nothing blurs it.
    expect(run.blur).toMatchObject({ blurred: 2, reasons: { held_minor_or_pending: 1, nudenet_score: 0, erax_only: 0, policy: 1 } });
  });

  it("counts a faceless frame aged from the body apart from face ages", () => {
    const body = image("body.jpg", { face_count: 0, people: [{ bbox: [0, 0, 1, 1], det_score: 0.9, face_index: null, age_years: 25, age_source: "mivolo" }] });
    const run = runStats({ ...SUMMARY, results: [faced("a.jpg", 30), body] }, null, new Map(), new Map(), NO_TAGS, []);
    expect(run.age).toMatchObject({ frames_with_face_age: 1, frames_with_body_age_only: 1, faces_measured: 1, frames_without_face: 1, youngest_from: { face: 1, body: 1, set: 0 } });
  });

  it("records switched-off policies, and counts without them", () => {
    const off = withoutPolicies(SUMMARY, ["adult-v2"]);
    const run = runStats(off, null, new Map(), new Map(), NO_TAGS, policiesRun(off), new Date(), { policiesOff: ["adult-v2"] });
    expect(run.policies_off).toEqual(["adult-v2"]);
    expect(run.policies.map((entry) => entry.policy)).toEqual(["adult"]);
    // 01 was split only because adult-v2 flagged it; without it, it is safe.
    expect(run.verdicts).toMatchObject({ split: 0, safe: 3, official_safe_variant_flagged: 0 });
    expect(runStatsFilename(SUMMARY, ["default", "adult"])).toBe("run-stats-one_set-abcdef12-without-adult+default.json");
  });

  it("lists the trigger tags against the rest of the scan", () => {
    expect(stats.tags.map((entry) => [entry.tag, entry.group, entry.images, entry.by_hand])).toEqual([
      ["bedroom", "setting", 1, 0],
      ["lingerie", "wardrobe", 1, 1],
    ]);
    const lingerie = stats.tags[1].policies[0];
    expect(lingerie).toMatchObject({ policy: "adult", tagged_checked: 1, tagged_unsafe: 1, tagged_flag_rate: "100%", rest_checked: 3, rest_unsafe: 0, rest_flag_rate: "0%" });
    expect(lingerie.bands.mid).toEqual({ tagged_checked: 1, tagged_unsafe: 1, rest_checked: 0, rest_unsafe: 0 });
  });

  it("fills the scan form back from its own file", () => {
    const file = JSON.parse(JSON.stringify(stats));
    expect(templateFromRunStats(file, "/data/images", DETECTORS)).toEqual({
      template: { folder: "adult/one set", policy: { policy: "adult", variants: ["adult-v2"] }, withGarments: false, setAge: true, readBodies: false, drops: [], cropWatermarks: false, cropMaxCut: 17 },
      notes: [],
    });
    // A curator without adult-v2 drops it and says so.
    const fewer = templateFromRunStats(file, "/data/images", { ...DETECTORS, singguard_policies: ["default", "adult"] });
    expect(fewer.template.policy).toEqual({ policy: "adult", variants: [] });
    expect(fewer.notes).toEqual(["This curator does not offer adult-v2, so it was left out."]);
    // A file saved with a policy switched off names only the ones left on.
    const off = withoutPolicies(SUMMARY, ["adult"]);
    const saved = JSON.parse(JSON.stringify(runStats(off, null, new Map(), new Map(), NO_TAGS, policiesRun(off), new Date(), { policiesOff: ["adult"] })));
    const isolated = templateFromRunStats(saved, "/data/images", DETECTORS);
    expect(isolated.template.policy).toEqual({ policy: "adult-v2", variants: [] });
    expect(isolated.notes).toEqual(["The file was saved with adult switched off, so the form runs only the policies left on."]);
    expect(() => templateFromRunStats({ hello: 1 }, "/data/images", DETECTORS)).toThrow("not a Run stats file");
    expect(() => templateFromRunStats(file, "/elsewhere", DETECTORS)).toThrow("not under this curator's source root");
  });

  it("counts prefiltered images apart, and leaves them out of every other section", () => {
    const prefilter = { drop_nsfw: true, drop_no_face: true, drop_no_age: false };
    const dropped = image("x.jpg", { passed: false, reject_reason: "prefilter:nsfw", nsfw: { detections: [], labels: { FEMALE_BREAST_EXPOSED: 0.9 }, exposed_score: 0.9 } });
    const faceless = image("y.jpg", { passed: false, reject_reason: "prefilter:no-face" });
    const scan = { ...SUMMARY, prefilter_config: prefilter, total: 7, results: [...SUMMARY.results, dropped, faceless] };
    const run = runStats(scan, null, new Map(), new Map(), NO_TAGS, ["adult", "adult-v2"]);
    expect(run.config.prefilter).toEqual(prefilter);
    expect(run.images.prefiltered).toEqual({ nsfw: 1, "no-face": 1 });
    expect(run.images.reject_reasons).toEqual({ blur: 1, "prefilter:nsfw": 1, "prefilter:no-face": 1 });
    // The NudeNet section is the same as without them.
    expect(run.nudenet).toEqual(stats.nudenet);
    // The form reads the drops back from the scan and from its Run stats file.
    expect(templateFromSummary(scan, "/data/images", DETECTORS).drops).toEqual(["nsfw", "no-face"]);
    expect(templateFromRunStats(JSON.parse(JSON.stringify(run)), "/data/images", DETECTORS).template.drops).toEqual(["nsfw", "no-face"]);
  });

  it("names the file after the folder and the scan", () => {
    expect(stats.generated_at).toBe("2026-10-27T12:00:00.000Z");
    expect(runStatsFilename(SUMMARY)).toBe("run-stats-one_set-abcdef12.json");
    expect(runStatsFilename({ scan_id: "abcdef1234567890", folder: "/" })).toBe("run-stats-root-abcdef12.json");
  });
});

describe("detail lines", () => {
  it("say the number and the word behind it", () => {
    expect(qualityLine(image("a.jpg"))).toBe("0.800 · sharpness 350");
    expect(qualityLine(image("a.jpg", { score: 0, reject_reason: "blur" }))).toBe("0.000 · blur");
    expect(nudeNetLine({ exposed_score: 0.84, labels: { FEMALE_BREAST_EXPOSED: 0.84, BUTTOCKS_EXPOSED: 0.31, FACE_FEMALE: 0.9 } })).toBe("0.84 · female breast exposed 0.84, buttocks exposed 0.31");
    expect(nudeNetLine({ exposed_score: 0.84, labels: { FEMALE_BREAST_EXPOSED: 0.84 } }, "explicit")).toBe("explicit · 0.84 · female breast exposed 0.84");
    expect(nudeNetLine({ exposed_score: 0, labels: { FACE_FEMALE: 0.9 } })).toBe("0.00 · nothing exposed at 0.2");
    // Curator 0.11's EraX fill-in names itself, so an EraX score is not read as NudeNet's.
    expect(nsfwSource({})).toBeNull();
    expect(nsfwSource({ erax_filled: true })).toBe("filled from EraX: NudeNet scored nothing exposed");
    expect(nsfwSource({ erax_filled: true, nudenet_failed: true })).toBe("EraX alone: NudeNet's check failed");
    expect(nudeNetLine({ exposed_score: 0.6, labels: { FEMALE_BREAST_EXPOSED: 0.6 } }, null, nsfwSource({ erax_filled: true }))).toBe("0.60 · female breast exposed 0.60 · filled from EraX");
    expect(
      sceneLine(
        [
          { label: "bedroom", conf: 0.3 },
          { label: "hotel_room", conf: 0.61 },
        ],
        "indoor",
      ),
    ).toBe("hotel_room 0.61 · indoor");
    expect(sceneLine([], "outdoor")).toBe("outdoor");
    expect(
      confLine([
        { label: "shoe", conf: 0.71 },
        { label: "dress", conf: 0.82 },
        { label: "hat", conf: 0.5 },
        { label: "belt", conf: 0.4 },
      ]),
    ).toBe("dress 0.82, shoe 0.71, hat 0.50 +1");
    expect(confLine([{ label: "top_tshirt_sweatshirt", conf: 0.9 }])).toBe("top tshirt sweatshirt 0.90");
  });
});

describe("ago", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  it("rounds to the unit a reader wants", () => {
    expect(ago("2026-10-27T11:59:40Z", now)).toBe("just now");
    expect(ago("2026-10-27T11:55:00Z", now)).toBe("5 min ago");
    expect(ago("2026-10-27T09:10:00Z", now)).toBe("3 h ago");
    expect(ago("2026-10-25T12:00:00Z", now)).toBe("2 d ago");
    expect(ago("2026-10-01T12:00:00Z", now)).toBe("2026-10-01");
    expect(ago("not a date", now)).toBe("not a date");
  });
});
