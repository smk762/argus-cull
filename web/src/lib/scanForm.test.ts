import { describe, expect, it } from "vitest";

import { measuredAges, shownAge } from "./chunks";
import { confLine, nudeNetLine, qualityLine, sceneLine } from "./detailLines";
import { runStats, runStatsFilename } from "./runStats";
import { templateFromSummary, templateFromView, templateSummary, viewWithTemplate } from "./scanTemplate";
import { ago } from "./time";
import { DEFAULT_VIEW, type Detectors, type FaceAttributes, type ImageResult, type ScanSummary } from "./types";

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
    expect(shownAge(two)).toEqual({ text: "28y", title: "Youngest of 2 faces, MiVOLO. The primary face reads 43y." });
    // The face list carries the primary face, so it is not counted twice; a record with no list has the primary alone.
    expect(measuredAges(two)).toEqual([43, 28]);
    expect(measuredAges(faced("one.jpg", 30))).toEqual([30]);
    expect(measuredAges(faced("old.jpg", 30, { faces: [{ attributes: mivolo(25) }] }))).toEqual([30, 25]);
    // A primary that is the youngest is just the age.
    const young = faced("b.jpg", 20, { face_count: 2, faces: [{ primary: true, attributes: mivolo(20) }, { attributes: mivolo(35) }] });
    expect(shownAge(young)).toEqual({ text: "20y", title: "Youngest of 2 faces, MiVOLO" });
    expect(shownAge(faced("c.jpg", 31.4))).toEqual({ text: "31y", title: "Apparent age, MiVOLO years" });
    // No face: the set's age when the scan gave one, else nothing.
    expect(shownAge(image("d.jpg", { set_age: SET_AGE }))?.text).toBe("≈20y set");
    expect(shownAge(image("e.jpg"))).toBeNull();
    // Only FairFace ran: its bracket stands in.
    expect(shownAge(image("f.jpg", { face_count: 1, primary_face_attributes: { ...mivolo(0), age_years: null, age_source: "fairface", age: "20-29" } }))).toEqual({ text: "20-29", title: "FairFace age bracket of the primary face" });
  });
});

describe("scan template", () => {
  it("reads the form back out of a finished scan", () => {
    const template = templateFromSummary(SUMMARY, "/data/images", DETECTORS);
    expect(template).toEqual({ folder: "adult/one set", policy: { policy: "adult", variants: ["adult-v2"] }, withGarments: false, setAge: true, readBodies: false });
    // A scan that ran garments runs them again; one with no recorded policy takes the picker's default.
    const plain = { ...SUMMARY, garments_config: { enabled: true, min_conf: 0.3 }, guard_config: { enabled: false }, faces_config: { enabled: true, fairface: true, mivolo: true } };
    expect(templateFromSummary(plain, "/data/images/", DETECTORS)).toEqual({ folder: "adult/one set", policy: { policy: "adult", variants: [] }, withGarments: true, setAge: false, readBodies: false });
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
    expect(templateSummary({ folder: "", policy: { policy: "default", variants: [] }, withGarments: true, setAge: false, readBodies: false }, DETECTORS)).toBe("default · garments");
    expect(templateSummary({ folder: "", policy: { policy: "default", variants: [] }, withGarments: true, setAge: false, readBodies: false }, { ...DETECTORS, garments: false, singguard_policies: [] })).toBe("");
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
    expect(stats.config).toEqual({ faces: true, fairface: false, mivolo: true, set_age: true, scenes: true, garments: false, nsfw: true, guard: true, policy: "adult", variants: ["adult-v2"] });
    // similar-to:<file> is one reason, not one per file.
    expect(stats.images).toEqual({ total: 5, passed: 4, rejected: 1, duplicates: 0, reject_reasons: { blur: 1 }, kept: 2, left_out: 3, left_out_reasons: { guard_unsafe: 1, "similar-to": 1, rejected: 1 } });
    // A selection from another scan does not count.
    expect(runStats(SUMMARY, { scan_id: "other", total: 0, kept: 0, rows: [] }, new Map(), new Map(), NO_TAGS, []).images.kept).toBeNull();
    // A scan that ran without SingGuard records a policy name all the same; it judged nothing, so nothing is reported for it.
    const off: ScanSummary = { ...SUMMARY, guard_config: { enabled: false, policy: "default" }, results: SUMMARY.results.map((img) => ({ ...img, guard: undefined, guard_variants: undefined })) };
    const quiet = runStats(off, null, new Map(), new Map(), NO_TAGS, ["default"]);
    expect(quiet.config).toMatchObject({ guard: false, policy: null, variants: [] });
    expect(quiet.policies).toEqual([]);
  });

  it("reads the ages, measured and set", () => {
    expect(stats.age).toEqual({
      frames_with_face_age: 3,
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
      set_age: SET_AGE,
      set_age_skipped: null,
    });
    const young = runStats({ ...SUMMARY, results: [faced("a.jpg", 16, { nsfw: { detections: [], labels: { FEMALE_BREAST_EXPOSED: 0.4 }, exposed_score: 0.4 } }), faced("b.jpg", 17)] }, null, new Map(), new Map(), NO_TAGS, []);
    expect(young.age.frames_under_18).toBe(2);
    expect(young.age.frames_minor_exposed).toBe(1);
  });

  it("bands NudeNet and rates each policy", () => {
    expect(stats.nudenet).toEqual({ scored: 5, mean_exposed: 0.34, bands: { low: 2, mid: 1, high: 2, unscored: 0 } });
    expect(stats.policies.map((entry) => [entry.policy, entry.official, entry.checked, entry.unsafe, entry.flag_rate])).toEqual([
      ["adult", true, 4, 1, "25%"],
      ["adult-v2", false, 1, 1, "100%"],
    ]);
    expect(stats.policies[1].agreement).toEqual({ both: 0, only_official: 0, only_this: 1, neither: 0 });
    // The one label is adult, so the flag on 03 is a false positive.
    expect(stats.policies[0]).toMatchObject({ labelled: 1, precision: "0%", recall: "–", fp: 1 });
    expect(stats.policies[1].precision).toBeNull();
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
