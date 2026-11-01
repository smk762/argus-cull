import { describe, expect, it } from "vitest";

import { contentRatingAvailable, detectorGroups, policyAvailable } from "./detectors";
import { contentRating, exposedLabelsForRequest, guardRuleLabel, isSensitive, rateContent, ratingCounts, recordedGuardRules } from "./moderation";
import { exportedAbsPathList, exportBody, keptPathList, selectionJsonl } from "./paths";
import { ageMissing, awaitingChecks, blurFromEnv, bodyAges, facesRan, filterByAge, filterByFaces, filterByKeep, filterByPassed, folderLabel, isMinorExposed, mergeChunk, revealHeld, shouldBlur, shownAge, sortImages, usesSetAge, youngestAge } from "./chunks";
import { evaluateSubset } from "./subset";
import { cascadePath, displayGuardExplanation, finalJudgment, splitGuardExplanation } from "./guardText";
import { checkStage, mergeProgress, phaseLabel, progressRatio } from "./progress";
import { withoutScan } from "./purge";
import { availability, facetCounts, recordedScenes, scanBody, selectBody } from "./select";
import { parseSseFrames } from "./sse";
import { curatorUrl, DEFAULT_FILTER, DEFAULT_VIEW, EXPOSED_LABELS, type Detectors, type FilterState, type ImageResult, type ScanSummary } from "./types";
import { clusterLabel, namedFaces, parseView, serializeView, withFaceName } from "./urlState";

const DETECTORS: Detectors = {
  torch: false,
  cuda: false,
  clip: false,
  insightface: true,
  onnxruntime: true,
  fairface: true,
  mivolo: true,
  places365: true,
  garments: true,
};

const NONE: Detectors = { ...DETECTORS, insightface: false, fairface: false, mivolo: false, places365: false, garments: false };

function summary(flags: Partial<ScanSummary["faces_config"]> & { scenes?: boolean; garments?: boolean; nsfw?: boolean; guard?: boolean }): ScanSummary {
  return {
    scan_id: "s",
    folder: "/data",
    faces_config: { enabled: true, fairface: true, mivolo: true, ...flags },
    scenes_config: { enabled: flags.scenes ?? true },
    garments_config: { enabled: flags.garments ?? true, min_conf: 0.3 },
    nsfw_config: { enabled: flags.nsfw ?? false },
    guard_config: { enabled: flags.guard ?? false },
    total: 1,
    passed: 1,
    rejected: 0,
    duplicates: 0,
    face_clusters: [],
    results: [
      {
        rel_path: "a.png",
        abs_path: "/data/a.png",
        score: 0.9,
        passed: true,
        reject_reason: null,
        similar_group: 1,
        group_size: 1,
        is_representative: true,
        is_duplicate: false,
        duplicate_of: null,
        keep_reason: "",
        sharpness: 10,
        width: 768,
        height: 768,
        face_count: 0,
        primary_face_cluster: null,
        primary_face_pose: null,
        primary_face_attributes: null,
        scene: { categories: [{ label: "beach", conf: 0.4 }, { label: "coast", conf: 0.2 }], environment: "outdoor", environment_conf: 0.8 },
        garments: null,
      },
    ],
  };
}

describe("url state", () => {
  it("round-trips a shared selection", () => {
    const view = {
      ...DEFAULT_VIEW,
      scan: "abc",
      folder: "faces",
      page: 2,
      photo: "faces/front.png",
      view: "people" as const,
      cluster: "face_1",
      filter: {
        ...DEFAULT_FILTER,
        minScore: 0.4,
        includeRejected: true,
        keepSimilar: true,
        facePoses: ["profile", "frontal"] as FilterState["facePoses"],
        garments: ["dress"] as FilterState["garments"],
        minAgeYears: 18,
        garmentsUncropped: true,
        scenes: ["beach"],
        nsfwThreshold: 0.5,
        nsfwExposedLabels: ["ANUS_EXPOSED"] as FilterState["nsfwExposedLabels"],
        contentRatings: ["safe", "explicit"] as FilterState["contentRatings"],
        guardRules: ["A"],
      },
    };
    const once = parseView(new URLSearchParams(serializeView(view).slice(1)));
    expect(serializeView(once)).toBe(serializeView(view));
    expect(once.scan).toBe("abc");
    expect(once.folder).toBe("faces");
    expect(once.page).toBe(2);
    expect(once.photo).toBe("faces/front.png");
    expect(once.view).toBe("people");
    expect(once.cluster).toBe("face_1");
    expect(once.filter.minScore).toBe(0.4);
    expect(once.filter.includeRejected).toBe(true);
    expect(once.filter.facePoses).toEqual(["frontal", "profile"]);
    expect(once.filter.garments).toEqual(["dress"]);
    expect(once.filter.minAgeYears).toBe(18);
    expect(once.filter.scenes).toEqual(["beach"]);
    expect(once.filter.garmentsUncropped).toBe(true);
    expect(once.filter.nsfwThreshold).toBe(0.5);
    expect(once.filter.nsfwExposedLabels).toEqual(["ANUS_EXPOSED"]);
    expect(once.filter.contentRatings).toEqual(["explicit", "safe"]);
    expect(once.filter.guardRules).toEqual(["A"]);
  });

  it("keeps cluster names in the URL", () => {
    const view = { ...DEFAULT_VIEW, faceNames: { face_1: "Ada", face_3: "Ada", face_2: "  " } };
    expect(serializeView(view)).toBe("?name=face_1%3AAda&name=face_3%3AAda");
    expect(parseView(new URLSearchParams("name=face_1:Ada&name=face_3:Ada")).faceNames).toEqual({ face_1: "Ada", face_3: "Ada" });
    expect(parseView(new URLSearchParams("name=:Ada&name=face_1:&name=face_1")).faceNames).toEqual({});
    expect(namedFaces({ face_1: " Ada ", " ": "x", face_2: "" })).toEqual({ face_1: "Ada" });
    expect(clusterLabel("face_1", { face_1: " Ada " })).toBe("Ada");
    expect(clusterLabel("face_2", { face_1: "Ada" })).toBe("face_2");
    expect(withFaceName(DEFAULT_VIEW, "face_1", "Ada").faceNames).toEqual({ face_1: "Ada" });
    expect(withFaceName({ ...DEFAULT_VIEW, faceNames: { face_1: "Ada" } }, "face_1", "").faceNames).toEqual({});
  });

  it("keeps a space in a cluster name through the URL", () => {
    // Each keystroke writes the query string. Trimming would eat the space in "Mary Jane".
    const typing = parseView(new URLSearchParams(serializeView({ ...DEFAULT_VIEW, faceNames: { face_1: "Mary " } }).slice(1)));
    expect(typing.faceNames).toEqual({ face_1: "Mary " });
    const named = parseView(new URLSearchParams(serializeView({ ...DEFAULT_VIEW, faceNames: { face_1: "Mary Jane" } }).slice(1)));
    expect(named.faceNames).toEqual({ face_1: "Mary Jane" });
    expect(namedFaces({ face_1: "Mary " })).toEqual({ face_1: "Mary" });
  });

  it("reads a content-rating facet from the URL", () => {
    expect(parseView(new URLSearchParams("f=rating:explicit")).filter.contentRatings).toEqual(["explicit"]);
    expect(parseView(new URLSearchParams("f=rating:nsfw")).filter.contentRatings).toEqual([]);
    expect(serializeView({ ...DEFAULT_VIEW, filter: { ...DEFAULT_FILTER, contentRatings: ["safe"] } })).toBe("?f=rating%3Asafe");
  });

  it("keeps every NudeNet class in the exposed set", () => {
    const view = parseView(new URLSearchParams("nsfw=0.5&f=exposed:BELLY_EXPOSED&f=exposed:FACE_FEMALE"));
    expect(view.filter.nsfwExposedLabels).toEqual(["BELLY_EXPOSED", "FACE_FEMALE"]);
    expect(serializeView(view)).toContain("f=exposed%3ABELLY_EXPOSED");
  });

  it("ignores an exposed threshold NudeNet cannot report", () => {
    expect(parseView(new URLSearchParams("nsfw=0.1")).filter.nsfwThreshold).toBeNull();
  });

  it("keeps the garment opt-in in the URL", () => {
    expect(parseView(new URLSearchParams("garments=on")).withGarments).toBe(true);
    expect(parseView(new URLSearchParams("garments=off")).withGarments).toBe(false);
    expect(parseView(new URLSearchParams("")).withGarments).toBe(false);
    expect(serializeView({ ...DEFAULT_VIEW, withGarments: true })).toBe("?garments=on");
    expect(serializeView({ ...DEFAULT_VIEW, withGarments: false })).toBe("");
    expect(parseView(new URLSearchParams("set=1")).setAge).toBe(true);
    expect(serializeView({ ...DEFAULT_VIEW, setAge: true })).toBe("?set=1");
    expect(parseView(new URLSearchParams("bodies=1")).readBodies).toBe(true);
    expect(serializeView({ ...DEFAULT_VIEW, readBodies: true })).toBe("?bodies=1");
    // An old link with a race facet loads without it.
    expect(serializeView(parseView(new URLSearchParams("f=race:white")))).toBe("");
  });

  it("drops an unknown pose and omits the default filter", () => {
    expect(parseView(new URLSearchParams("f=pose:sideways")).filter.facePoses).toEqual([]);
    expect(serializeView(DEFAULT_VIEW)).toBe("");
  });
});

describe("select body", () => {
  const open = availability(DETECTORS, summary({}));

  it("maps the filter and leaves transfer fields off", () => {
    const body = selectBody({ ...DEFAULT_FILTER, minScore: 0.25, facePoses: ["frontal"], garments: ["jacket"] }, open);
    expect(body.min_score).toBe(0.25);
    expect(body.face_poses).toEqual(["frontal"]);
    expect(body.garments).toEqual(["jacket"]);
    expect(body).not.toHaveProperty("max_keep");
    expect(body).not.toHaveProperty("dest");
    expect(body).not.toHaveProperty("diversify_scenes");
  });

  it("omits groups the scan did not run", () => {
    const gates = availability(DETECTORS, summary({ enabled: false, fairface: false, mivolo: false, scenes: false, garments: false }));
    const body = selectBody({ ...DEFAULT_FILTER, facePoses: ["profile"], scenes: ["beach"], garments: ["dress"], minAgeYears: 20 }, gates);
    expect(body.face_poses).toBeNull();
    expect(body.scenes).toBeNull();
    expect(body.garments).toBeNull();
    expect(body.min_age_years).toBeNull();
  });

  it("requests a detector only when its weights are loaded", () => {
    expect(scanBody("shoots", NONE).faces).toEqual({ enabled: false, fairface: false, mivolo: false });
    expect(scanBody("shoots", NONE).scenes).toEqual({ enabled: false });
    // FairFace is never asked for, even when its weights are loaded: cull does not offer race.
    expect(scanBody("shoots", { ...NONE, fairface: true }).faces).toEqual({ enabled: false, fairface: false, mivolo: false });
    expect(scanBody("shoots", DETECTORS).faces.fairface).toBe(false);
    // Fashionpedia is opt in: the slowest local check, and nothing else in the scan waits on it.
    expect(scanBody("", DETECTORS).garments.enabled).toBe(false);
    expect(scanBody("", DETECTORS, null, { withGarments: true, setAge: false, readBodies: false }).garments.enabled).toBe(true);
    expect(scanBody("", DETECTORS, null, { withGarments: false, setAge: false, readBodies: false }).scenes.enabled).toBe(true);
    // Asking for it does nothing when the weights are not loaded.
    expect(scanBody("", NONE, null, { withGarments: true, setAge: false, readBodies: false }).garments.enabled).toBe(false);
    // The set age is asked for only with MiVOLO loaded; the field is absent otherwise so an older curator sees nothing new.
    expect(scanBody("", DETECTORS, null, { withGarments: false, setAge: true, readBodies: false }).faces.set_age).toBe(true);
    expect(scanBody("", DETECTORS, null, { withGarments: false, setAge: false, readBodies: false }).faces).not.toHaveProperty("set_age");
    expect(scanBody("", { ...DETECTORS, mivolo: false }, null, { withGarments: false, setAge: true, readBodies: false }).faces).not.toHaveProperty("set_age");
    // Bodies are asked for only with MiVOLO and the person detector loaded (curator 0.10).
    const bodies = { withGarments: false, setAge: false, readBodies: true };
    expect(scanBody("", { ...DETECTORS, bodies: true }, null, bodies).faces.mivolo_body).toBe(true);
    expect(scanBody("", { ...DETECTORS, bodies: true }).faces).not.toHaveProperty("mivolo_body");
    expect(scanBody("", DETECTORS, null, bodies).faces).not.toHaveProperty("mivolo_body");
    expect(scanBody("", { ...DETECTORS, bodies: true, mivolo: false }, null, bodies).faces).not.toHaveProperty("mivolo_body");
    expect(scanBody("shoots", NONE).nsfw).toEqual({ enabled: false });
    expect(scanBody("shoots", NONE).guard).toEqual({ enabled: false });
    expect(scanBody("shoots", { ...NONE, nudenet: true, singguard: true }).nsfw.enabled).toBe(true);
    expect(scanBody("shoots", { ...NONE, nudenet: true, singguard: true }).guard.enabled).toBe(true);
  });

  it("names the adult policy only when the server offers it", () => {
    const offered = { ...NONE, singguard: true, singguard_policies: ["default", "adult"] };
    const adult = { policy: "adult", variants: [] };
    expect(scanBody("shoots", offered, adult).guard).toEqual({ enabled: true, policy: "adult" });
    expect(scanBody("shoots", offered).guard).toEqual({ enabled: true });
    // curator 0.4 has no singguard_policies and would ignore the field.
    expect(scanBody("shoots", { ...NONE, singguard: true }, adult).guard).toEqual({ enabled: true });
    expect(scanBody("shoots", NONE, adult).guard).toEqual({ enabled: false });
  });

  it("keeps the policy choice in the URL and names rule A by the scan's policy", () => {
    const view = parseView(new URLSearchParams("policy=adult&variants=adult-granular,adult-cautious"));
    expect(view.guardPolicy).toBe("adult");
    expect(view.guardVariants).toEqual(["adult-granular", "adult-cautious"]);
    expect(serializeView(view)).toContain("policy=adult&variants=adult-granular%2Cadult-cautious");
    expect(parseView(new URLSearchParams("")).guardPolicy).toBeNull();
    expect(serializeView(parseView(new URLSearchParams("")))).not.toContain("policy=");
    // A name is kept as spelled; the scan body drops any the curator does not list.
    expect(parseView(new URLSearchParams("policy=anything&variants=,bad%20name,ok")).guardPolicy).toBe("anything");
    expect(parseView(new URLSearchParams("variants=,bad%20name,ok")).guardVariants).toEqual(["ok"]);
    const adult = { guard_config: { enabled: true, policy: "adult" } } as unknown as ScanSummary;
    expect(guardRuleLabel("A", adult)).toBe("A. Illegal Sexual Content");
    expect(guardRuleLabel("A", null)).toBe("A. Sexual Content Risk");
    expect(guardRuleLabel("B", adult)).toBe("B. Real-World Crimes & Public Safety");
  });

  it("sends NudeNet and SingGuard filters only for a scan that ran them", () => {
    const open = availability({ ...DETECTORS, nudenet: true, singguard: true }, summary({ nsfw: true, guard: true }));
    const filter = {
      ...DEFAULT_FILTER,
      nsfwThreshold: 0.5,
      nsfwExposedLabels: ["ANUS_EXPOSED"] as FilterState["nsfwExposedLabels"],
      guardUnsafe: true,
      guardRules: ["A"],
    };
    const body = selectBody(filter, open);
    expect(body.nsfw_threshold).toBe(0.5);
    expect(body.nsfw_exposed_labels).toEqual(["ANUS_EXPOSED"]);
    expect(body.nsfw_label_thresholds).toBeNull();
    expect(body.guard_unsafe).toBe(true);
    expect(body.guard_rules).toBeNull();
    const idle = selectBody(filter, availability(DETECTORS, summary({})));
    expect(idle.nsfw_threshold).toBeNull();
    expect(idle.nsfw_exposed_labels).toBeUndefined();
    expect(idle.guard_unsafe).toBe(false);
    expect(exposedLabelsForRequest({ ...filter, nsfwExposedLabels: [...EXPOSED_LABELS] }, true)).toBeUndefined();
  });

  it("sends content ratings only for a scan that ran NudeNet", () => {
    const open = availability({ ...DETECTORS, nudenet: true }, summary({ nsfw: true }));
    const filter = { ...DEFAULT_FILTER, contentRatings: ["safe", "suggestive"] as FilterState["contentRatings"] };
    expect(selectBody(filter, open).content_ratings).toEqual(["safe", "suggestive"]);
    expect(selectBody(DEFAULT_FILTER, open).content_ratings).toBeNull();
    expect(selectBody(filter, availability(DETECTORS, summary({}))).content_ratings).toBeNull();
  });

  it("collects scene labels from the recorded top-k", () => {
    expect(recordedScenes(summary({}))).toEqual(["beach", "coast"]);
  });
});

describe("path downloads", () => {
  const rows = [
    { rel_path: "keep.png", abs_path: "/data/keep.png", keep_reason: "" },
    { rel_path: "drop.png", abs_path: "/data/drop.png", keep_reason: "below-score" },
  ];

  it("lists kept paths and a jsonl row for every image", () => {
    expect(keptPathList(rows)).toBe("keep.png\n");
    expect(selectionJsonl(rows).trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      { rel_path: "keep.png", abs_path: "/data/keep.png", keep_reason: "" },
      { rel_path: "drop.png", abs_path: "/data/drop.png", keep_reason: "below-score" },
    ]);
    expect(keptPathList([])).toBe("");
  });

  it("exports absolute paths the server published, not a joined dest", () => {
    expect(exportedAbsPathList({ exported_abs_paths: { "a.png": "/out/a.png", "b.png": "/out/nested/b.png" } })).toBe(
      "/out/a.png\n/out/nested/b.png\n",
    );
    const body = exportBody("scan", "selection", "move", selectBody(DEFAULT_FILTER, openGates()));
    expect(body).toMatchObject({ scan_id: "scan", dest: "selection", mode: "move", write_manifest: true });
    expect(body).not.toHaveProperty("max_keep");
    expect(body).not.toHaveProperty("write_xmp");
    expect(body).not.toHaveProperty("face_names");
    const named = exportBody("scan", "selection", "copy", selectBody(DEFAULT_FILTER, openGates()), {
      writeXmp: true,
      faceNames: { face_1: "Ada", face_3: "Ada", face_2: "  " },
    });
    expect(named.write_xmp).toBe(true);
    expect(named.face_names).toEqual({ face_1: "Ada", face_3: "Ada" });
  });
});

function openGates() {
  return availability(DETECTORS, null);
}

describe("detectors", () => {
  it("names the convert command for a missing ONNX model", () => {
    const mivolo = detectorGroups({ ...DETECTORS, mivolo: false }).find((group) => group.id === "mivolo");
    expect(mivolo?.ready).toBe(false);
    expect(mivolo?.hint).toContain("mivolo-convert");
    // FairFace is not offered, so nothing suggests converting it.
    expect(detectorGroups(DETECTORS).map((group) => group.id)).not.toContain("fairface");
    expect(detectorGroups(DETECTORS).find((group) => group.id === "garments")?.label).toBe("Fashionpedia");
  });

  it("hides content rating until the server reports NudeNet", () => {
    expect(contentRatingAvailable(DETECTORS)).toBe(false);
    expect(contentRatingAvailable({ ...DETECTORS, nudenet: false })).toBe(false);
    expect(contentRatingAvailable({ ...DETECTORS, nudenet: true })).toBe(true);
    expect(policyAvailable(DETECTORS)).toBe(false);
    expect(policyAvailable({ ...DETECTORS, singguard: true })).toBe(true);
  });
});

describe("moderation", () => {
  it("blurs an exposed score or an unsafe verdict", () => {
    expect(isSensitive({})).toBe(false);
    expect(isSensitive({ nsfw: { detections: [], labels: {}, exposed_score: 0 }, guard: { safe: true, rules: [] } })).toBe(false);
    expect(isSensitive({ nsfw: { detections: [], labels: { ANUS_EXPOSED: 0.4 }, exposed_score: 0.4 } })).toBe(true);
    expect(isSensitive({ guard: { safe: false, rules: ["A. Sexual Content Risk"] } })).toBe(true);
    expect(isSensitive({ guard: { safe: false, rules: ["Safe"] } })).toBe(false);
  });

  it("rates NudeNet the way the curator does", () => {
    expect(rateContent(null)).toBeNull();
    expect(rateContent({ detections: [], labels: {}, exposed_score: 0 })).toBe("safe");
    expect(rateContent({ detections: [], labels: { FEMALE_BREAST_COVERED: 0.4 }, exposed_score: 0 })).toBe("suggestive");
    expect(rateContent({ detections: [], labels: { FEMALE_BREAST_EXPOSED: 0.4, FEMALE_BREAST_COVERED: 0.9 }, exposed_score: 0.4 })).toBe("explicit");
    expect(rateContent({ detections: [], labels: { FACE_FEMALE: 0.9 }, exposed_score: 0.1 })).toBe("safe");
    // An older curator that does not send content_rating still rates from nsfw.
    expect(contentRating({ nsfw: { detections: [], labels: { BUTTOCKS_COVERED: 0.3 }, exposed_score: 0 } })).toBe("suggestive");
    expect(contentRating({ content_rating: "safe", nsfw: { detections: [], labels: { FEMALE_BREAST_EXPOSED: 0.9 }, exposed_score: 0.9 } })).toBe("safe");
    expect(contentRating({ content_rating: null, nsfw: { detections: [], labels: {}, exposed_score: 0 } })).toBeNull();
    expect(ratingCounts([
      { nsfw: { detections: [], labels: {}, exposed_score: 0 } },
      { nsfw: { detections: [], labels: { FEMALE_BREAST_COVERED: 0.5 }, exposed_score: 0 } },
      { nsfw: { detections: [], labels: { ANUS_EXPOSED: 0.7 }, exposed_score: 0.7 } },
      { nsfw: null },
    ])).toEqual({ safe: 1, suggestive: 1, explicit: 1 });
  });

  it("keeps default SingGuard letters and adds a custom rule", () => {
    const scan = summary({ guard: true });
    scan.results[0].guard = { safe: false, rules: ["A. Sexual Content Risk", "house style"] };
    expect(recordedGuardRules(scan, ["A", "B"])).toEqual(["house style"]);
  });
});

describe("curator url", () => {
  it("follows the host the page was opened as and keeps the curator port", () => {
    expect(curatorUrl("192.168.30.39")).toBe("http://192.168.30.39:8101");
    expect(curatorUrl("localhost")).toBe("http://localhost:8101");
    expect(curatorUrl("")).toBe("http://localhost:8101");
  });

  it("uses a curator on another machine as configured", () => {
    expect(curatorUrl("192.168.30.39", "http://nas.local:8101")).toBe("http://nas.local:8101");
    expect(curatorUrl("192.168.30.39", "https://curator.example/")).toBe("https://curator.example");
    expect(curatorUrl("192.168.30.39", "http://127.0.0.1:8101")).toBe("http://192.168.30.39:8101");
    expect(curatorUrl("192.168.30.39", "not a url")).toBe("not a url");
  });
});

describe("progress", () => {
  it("names each scan phase and keeps an unknown one readable", () => {
    expect(phaseLabel("scoring")).toBe("Scoring images");
    expect(phaseLabel("guard")).toBe("Checking policy");
    expect(phaseLabel("transferring")).toBe("Writing the export");
    expect(phaseLabel("near_dup")).toBe("near dup");
  });

  it("says whether a live scan has a check queued, running, or behind it", () => {
    const scoring = [{ phase: "scoring", done: 1, total: 4 }];
    expect(checkStage(["nsfw"], scoring, [])).toBe("queued");
    expect(checkStage(["nsfw"], [], [])).toBe("queued");
    expect(checkStage(["nsfw"], [{ phase: "faces", done: 1, total: 4 }], ["faces", "nsfw"])).toBe("running");
    expect(checkStage(["scenes"], [{ phase: "scenes", done: 1, total: 4 }], [])).toBe("running");
    expect(checkStage(["scenes"], [{ phase: "guard", done: 1, total: 4 }], [])).toBe("waiting");
    expect(checkStage(["faces", "identities"], [{ phase: "identities", done: 0, total: 0 }], [])).toBe("running");
  });

  it("reports a fraction only once the phase has a total", () => {
    expect(progressRatio({ phase: "collecting", done: 0, total: 0 })).toBeNull();
    expect(progressRatio({ phase: "scoring", done: 1, total: 4 })).toBe(0.25);
    expect(progressRatio({ phase: "scoring", done: 9, total: 4 })).toBe(1);
  });

  it("keeps faces and NudeNet on the bar together and lets any other phase take over", () => {
    let rows = mergeProgress([], { phase: "scoring", done: 4, total: 4 });
    rows = mergeProgress(rows, { phase: "nsfw", done: 1, total: 5 });
    expect(rows.map((row) => row.phase)).toEqual(["nsfw"]);
    rows = mergeProgress(rows, { phase: "faces", done: 1, total: 3 });
    expect(rows.map((row) => row.phase)).toEqual(["faces", "nsfw"]);
    rows = mergeProgress(rows, { phase: "nsfw", done: 5, total: 5 });
    expect(rows.map((row) => `${row.phase} ${row.done}`)).toEqual(["faces 1", "nsfw 5"]);
    // A finished phase leaves once the next event lands.
    rows = mergeProgress(rows, { phase: "faces", done: 2, total: 3 });
    expect(rows.map((row) => row.phase)).toEqual(["faces"]);
    rows = mergeProgress(rows, { phase: "scenes", done: 0, total: 5 });
    expect(rows.map((row) => row.phase)).toEqual(["scenes"]);
  });
});

describe("scan chunks", () => {
  it("appends a batch and replaces an image when a later check lands", () => {
    const first = mergeChunk(null, {
      scan_id: "s",
      folder: "/data/images/set",
      phase: "scoring",
      done: 1,
      total: 2,
      pending_checks: ["nsfw", "guard"],
      results: [{ rel_path: "a.jpg", abs_path: "/a", score: 0.5, passed: true, reject_reason: null, similar_group: 0, group_size: 1, is_representative: true, is_duplicate: false, duplicate_of: null, keep_reason: "", sharpness: 1, width: 10, height: 10, face_count: 0, primary_face_cluster: null, primary_face_pose: null, primary_face_attributes: null, scene: null, garments: null }],
    });
    const next = mergeChunk(first, {
      scan_id: "s",
      folder: "/data/images/set",
      phase: "nsfw",
      done: 1,
      total: 2,
      pending_checks: ["nsfw", "guard"],
      results: [
        { rel_path: "b.jpg", abs_path: "/b", score: 0.9, passed: true, reject_reason: null, similar_group: 0, group_size: 1, is_representative: true, is_duplicate: false, duplicate_of: null, keep_reason: "", sharpness: 1, width: 10, height: 10, face_count: 0, primary_face_cluster: null, primary_face_pose: null, primary_face_attributes: null, scene: null, garments: null },
        { ...first.results[0], nsfw: { detections: [], labels: {}, exposed_score: 0.4 } },
      ],
    });
    expect(next.results.map((image) => image.rel_path)).toEqual(["a.jpg", "b.jpg"]);
    expect(next.results[0].nsfw?.exposed_score).toBe(0.4);
    expect(next.total).toBe(2);
  });

  it("lifts the blur under the NudeNet line and puts it back when policy flags the image", () => {
    const low = { nsfw: { detections: [], labels: {}, exposed_score: 0.2 } };
    expect(shouldBlur({}, ["nsfw"])).toBe(true);
    expect(shouldBlur(low, ["guard"])).toBe(false);
    expect(shouldBlur({ nsfw: { detections: [], labels: {}, exposed_score: 0.25 } }, ["guard"])).toBe(true);
    expect(shouldBlur({ ...low, guard: { safe: false, rules: ["A"] } }, [])).toBe(true);
    expect(shouldBlur({ ...low, guard: { safe: false, rules: ["A"] } }, [], { exposedScore: 0.25, policyBlur: false })).toBe(false);
    const shown = { exposedScore: 0.25, policyBlur: true, unblurNsfw: true };
    const years = (age: number) => ({ age_years: age, age_source: "mivolo" as const });
    expect(shouldBlur({ nsfw: { detections: [], labels: {}, exposed_score: 0.9 } }, [], shown)).toBe(false);
    expect(shouldBlur({ ...low, guard: { safe: false, rules: ["A"] } }, [], shown)).toBe(false);
    // Scoring batches land before MiVOLO runs, so an unchecked frame stays hidden until NudeNet reports.
    expect(shouldBlur({}, ["nsfw"], shown)).toBe(true);
    expect(shouldBlur({ primary_face_attributes: years(30) }, ["nsfw"], shown)).toBe(true);
    expect(shouldBlur({ primary_face_attributes: years(30), nsfw: { detections: [], labels: {}, exposed_score: 0.9 } }, ["guard"], shown)).toBe(false);
    expect(shouldBlur({}, ["faces", "nsfw"], shown)).toBe(true);
    expect(shouldBlur({ primary_face_attributes: years(16) }, ["nsfw"], shown)).toBe(true);
    // Curator 0.5.1 runs NudeNet beside faces. With the ages still coming, a frame
    // exposed enough for the under-18 rule waits; one under 0.2 cannot be hit by it.
    const exposed = { nsfw: { detections: [], labels: {}, exposed_score: 0.2 } };
    const faint = { nsfw: { detections: [], labels: { FACE_FEMALE: 0.9 }, exposed_score: 0.1 } };
    expect(shouldBlur(exposed, ["faces"])).toBe(true);
    expect(shouldBlur(exposed, ["faces"], shown)).toBe(true);
    expect(shouldBlur(faint, ["faces"])).toBe(false);
    expect(shouldBlur(faint, ["faces"], shown)).toBe(false);
    expect(shouldBlur({ ...exposed, primary_face_attributes: years(30) }, ["faces"])).toBe(false);
    expect(shouldBlur({ ...exposed, primary_face_attributes: years(16) }, ["faces"])).toBe(true);
    expect(revealHeld(exposed, ["faces"])).toBe(true);
    expect(revealHeld(exposed, ["guard"])).toBe(false);
    expect(awaitingChecks({}, ["nsfw"])).toBe(true);
    expect(awaitingChecks(faint, ["faces"])).toBe(true);
    expect(awaitingChecks(faint, ["guard"])).toBe(false);
    expect(awaitingChecks({ ...faint, primary_face_attributes: years(30) }, ["faces"])).toBe(false);
    expect(
      shouldBlur(
        { nsfw: { detections: [], labels: {}, exposed_score: 0 }, guard: { safe: false, rules: ["A"] }, primary_face_attributes: years(16) },
        [],
        shown,
      ),
    ).toBe(true);
    expect(blurFromEnv({})).toEqual({ exposedScore: 0.25, policyBlur: true });
    expect(blurFromEnv({ ARGUS_CULL_BLUR_EXPOSED_SCORE: "0.4", ARGUS_CULL_POLICY_BLUR: "0" })).toEqual({
      exposedScore: 0.4,
      policyBlur: false,
    });
  });

  it("keeps blur on an under-18 face once an exposed class scores 0.2", () => {
    const face = (years: number) => ({ age_years: years, age_source: "mivolo" as const });
    const exposed = (score: number) => ({ detections: [], labels: { BUTTOCKS_EXPOSED: score }, exposed_score: score });
    const minor = { nsfw: exposed(0.2), primary_face_attributes: face(17.4) };
    expect(isMinorExposed(minor)).toBe(true);
    expect(shouldBlur(minor, [])).toBe(true);
    expect(shouldBlur(minor, [], { exposedScore: 0.25, policyBlur: true, unblurNsfw: true })).toBe(true);
    expect(isMinorExposed({ nsfw: exposed(0.9), primary_face_attributes: face(18) })).toBe(false);
    expect(
      isMinorExposed({
        nsfw: { detections: [], labels: { BELLY_EXPOSED: 0.9 }, exposed_score: 0 },
        primary_face_attributes: face(10),
      }),
    ).toBe(false);
    expect(
      isMinorExposed({
        nsfw: exposed(0.2),
        primary_face_attributes: face(30),
        faces: [{ attributes: face(15) }],
      }),
    ).toBe(true);
  });

  it("sorts by file name, quality, head pose and face cluster", () => {
    const img = (rel: string, extra: Partial<ImageResult> = {}) => ({ rel_path: rel, score: 0.5, primary_face_pose: null, primary_face_cluster: null, ...extra }) as unknown as ImageResult;
    const names = (list: ImageResult[]) => list.map((image) => image.rel_path);
    const a10 = img("b/img10.jpg", { score: 0.9, primary_face_pose: "profile", primary_face_cluster: "c1" });
    const a2 = img("a/img2.jpg", { score: 0.2, primary_face_pose: "frontal", primary_face_cluster: "c0" });
    const a3 = img("img3.jpg", { score: 0.6, primary_face_cluster: "c1" });
    expect(names(sortImages([a10, a3, a2], "filename", "asc"))).toEqual(["a/img2.jpg", "img3.jpg", "b/img10.jpg"]);
    expect(names(sortImages([a10, a3, a2], "filename", "desc"))).toEqual(["b/img10.jpg", "img3.jpg", "a/img2.jpg"]);
    expect(names(sortImages([a2, a3, a10], "quality"))).toEqual(["b/img10.jpg", "img3.jpg", "a/img2.jpg"]);
    expect(names(sortImages([a10, a3, a2], "pose", "asc"))).toEqual(["a/img2.jpg", "b/img10.jpg", "img3.jpg"]);
    expect(names(sortImages([a10, a3, a2], "pose", "desc"))).toEqual(["b/img10.jpg", "a/img2.jpg", "img3.jpg"]);
    expect(names(sortImages([a2, a10, img("none.jpg"), a3], "cluster"))).toEqual(["b/img10.jpg", "img3.jpg", "a/img2.jpg", "none.jpg"]);
  });

  it("hides hard rejects from the grid only when asked", () => {
    const pass = { rel_path: "pass.jpg", passed: true } as unknown as ImageResult;
    const fail = { rel_path: "fail.jpg", passed: false } as unknown as ImageResult;
    expect(filterByPassed([pass, fail], false)).toHaveLength(2);
    expect(filterByPassed([pass, fail], true).map((image) => image.rel_path)).toEqual(["pass.jpg"]);
  });

  it("counts images per scene, environment and garment at the sidebar confidence", () => {
    const results = [
      { scene: { categories: [{ label: "airport", conf: 0.6 }, { label: "alcove", conf: 0.05 }], environment: "indoor", environment_conf: 0.9 }, garments: [{ label: "dress", conf: 0.8 }, { label: "dress", conf: 0.7 }] },
      { scene: { categories: [{ label: "airport", conf: 0.3 }], environment: "outdoor", environment_conf: 0.05 }, garments: [{ label: "shoe", conf: 0.3 }] },
      { scene: null, garments: null },
    ] as unknown as ImageResult[];
    const counts = facetCounts(results, 0.1, 0.5);
    expect([...counts.scenes]).toEqual([["airport", 2]]);
    expect([...counts.environments]).toEqual([["indoor", 1]]);
    expect([...counts.garments]).toEqual([["dress", 1]]);
  });

  it("sorts scored images above ones still waiting", () => {
    const waiting = { rel_path: "wait.jpg" } as unknown as ImageResult;
    const low = { rel_path: "low.jpg", nsfw: { detections: [], labels: {}, exposed_score: 0.1 } } as unknown as ImageResult;
    const high = { rel_path: "high.jpg", nsfw: { detections: [], labels: {}, exposed_score: 0.8 } } as unknown as ImageResult;
    const issue = { rel_path: "issue.jpg", guard: { safe: false, rules: ["A"] } } as unknown as ImageResult;
    const safe = { rel_path: "safe.jpg", guard: { safe: true, rules: [] } } as unknown as ImageResult;
    expect(sortImages([waiting, low, high], "nsfw").map((image) => image.rel_path)).toEqual(["high.jpg", "low.jpg", "wait.jpg"]);
    expect(sortImages([waiting, low, high], "nsfw", "asc").map((image) => image.rel_path)).toEqual(["low.jpg", "high.jpg", "wait.jpg"]);
    expect(sortImages([waiting, safe, issue], "policy").map((image) => image.rel_path)).toEqual(["issue.jpg", "safe.jpg", "wait.jpg"]);
    expect(sortImages([waiting, safe, issue], "policy", "asc").map((image) => image.rel_path)).toEqual(["safe.jpg", "issue.jpg", "wait.jpg"]);
    const older = { rel_path: "older.jpg", primary_face_attributes: { age_years: 40, age_source: "mivolo" } } as unknown as ImageResult;
    const younger = { rel_path: "younger.jpg", faces: [{ attributes: { age_years: 15, age_source: "mivolo" } }] } as unknown as ImageResult;
    expect(sortImages([waiting, older, younger], "age").map((image) => image.rel_path)).toEqual(["older.jpg", "younger.jpg", "wait.jpg"]);
    expect(sortImages([waiting, older, younger], "age", "asc").map((image) => image.rel_path)).toEqual(["younger.jpg", "older.jpg", "wait.jpg"]);
    expect(sortImages([older, younger], "scanned", "asc").map((image) => image.rel_path)).toEqual(["younger.jpg", "older.jpg"]);
    expect(filterByAge([older, younger, waiting], 16, 20).map((image) => image.rel_path)).toEqual([]);
    expect(filterByAge([older, younger, waiting], null, 18).map((image) => image.rel_path)).toEqual(["younger.jpg"]);
    expect(filterByAge([older, younger], null, null)).toHaveLength(2);
    const faceless = { rel_path: "body.jpg", face_count: 0, faces: [] } as unknown as ImageResult;
    const faced = { rel_path: "face.jpg", face_count: 1 } as unknown as ImageResult;
    expect(filterByFaces([faceless, faced], "none").map((image) => image.rel_path)).toEqual(["body.jpg"]);
    expect(filterByFaces([faceless, faced], "some").map((image) => image.rel_path)).toEqual(["face.jpg"]);
    expect(filterByFaces([faceless, faced], "all")).toHaveLength(2);
    const reasons = new Map([
      ["older.jpg", ""],
      ["younger.jpg", "below-score"],
    ]);
    expect(filterByKeep([older, younger, waiting], reasons, "kept").map((image) => image.rel_path)).toEqual(["older.jpg"]);
    expect(filterByKeep([older, younger, waiting], reasons, "left-out").map((image) => image.rel_path)).toEqual(["younger.jpg", "wait.jpg"]);
    expect(filterByKeep([older, younger], null, "kept")).toHaveLength(2);
  });

  it("scores the keep set from the signals the scan stored", () => {
    const keep = {
      rel_path: "keep.jpg",
      score: 0.8,
      passed: true,
      is_duplicate: false,
      sharpness: 400,
      width: 1024,
      height: 1536,
      face_count: 1,
      primary_face_cluster: "face_1",
      primary_face_pose: "frontal",
      primary_face_attributes: { age_years: 30, age_source: "mivolo" },
      nsfw: { exposed_score: 0.1 },
      guard: { safe: true },
    } as unknown as ImageResult;
    const drop = { ...keep, rel_path: "drop.jpg", score: 0.2, is_duplicate: true, face_count: 0, primary_face_cluster: null } as unknown as ImageResult;
    const summary = {
      results: [keep, drop],
      faces_config: { enabled: true, fairface: false, mivolo: true },
      scenes_config: { enabled: false },
      garments_config: { enabled: false },
      nsfw_config: { enabled: true },
      guard_config: { enabled: true },
      target_profile: { target_category: "identity" },
    } as unknown as ScanSummary;
    const report = evaluateSubset(summary, new Map([["keep.jpg", ""], ["drop.jpg", "below-score"]]), 0.6);
    expect(report.kept).toBe(1);
    expect(report.title).toBe("Keep set, for identity training");
    expect(report.stats.find((stat) => stat.label === "Mean quality")?.value).toBe("0.80");
    expect(report.notes.some((note) => note.includes("near-duplicate"))).toBe(false);
    const empty = evaluateSubset({ ...summary, results: [drop] }, new Map([["drop.jpg", "below-score"]]), 0.6);
    expect(empty.notes[0]).toMatch(/Nothing is kept/);
  });

  it("labels a scan by the folder under the source root", () => {
    expect(folderLabel("/data/images/set/day", "/data/images")).toEqual({ rel: "set/day", label: "day" });
    expect(folderLabel("/data/images", "/data/images")).toEqual({ rel: "", label: "source root" });
  });
});

describe("SingGuard explanation", () => {
  it("reads a cascade Final Judgment as the verdict, not as a parser conflict", () => {
    const text = [
      "Cascade: fast flagged this; the slow pass is the verdict.",
      "",
      "SingGuard did not give a safe or unsafe verdict. The check is unsafe so an unreadable result is not treated as safe.",
      "",
      "[Step 3] Final Judgment",
      "The image, when evaluated in isolation and in context, does not violate any of the defined risk categories. Therefore, the content is safe.",
    ].join("\n");
    expect(cascadePath(text)).toBe(true);
    expect(finalJudgment(text)).toBe("safe");
    const shown = displayGuardExplanation(text);
    expect(shown).toContain("Final Judgment");
    expect(shown).not.toContain("Cascade:");
    expect(shown).not.toContain("unreadable");
  });

  it("hides the cutoff note whether it names <answer> or Final Judgment", () => {
    const text = [
      "SingGuard's reply ended before a Final Judgment or <answer>, so it may have been cut off. The check is unsafe so an incomplete result is not treated as safe.",
      "",
      "[Step 2] Check Risk Categories",
      "The image is Safe.",
    ].join("\n");
    const shown = displayGuardExplanation(text);
    expect(shown).toContain("The image is Safe.");
    expect(shown).not.toContain("cut off");
    expect(shown).not.toContain("incomplete result");
  });

  it("splits steps and marks the fired rule", () => {
    const text = [
      "[Step 1] Content Summary",
      "A person is seated indoors.",
      "",
      "[Step 2] Check Risk Categories",
      "- A. Sexual Content Risk: the pose and setting match.",
      "- B. Real-World Crimes & Public Safety: none.",
      "",
      "[Step 3] Final Judgment",
      "This falls under A.",
    ].join("\n");
    const steps = splitGuardExplanation(text, ["A. Sexual Content Risk"]);
    expect(steps.map((step) => step.title)).toEqual(["Content Summary", "Check Risk Categories", "Final Judgment"]);
    expect(steps[1].rules.map((rule) => [rule.letter, rule.fired])).toEqual([
      ["A", true],
      ["B", false],
    ]);
    expect(steps[0].paragraphs).toEqual(["A person is seated indoors."]);
  });
});

describe("folder change", () => {
  it("drops the previous scan and keeps the score floor", () => {
    const next = withoutScan(
      {
        ...DEFAULT_VIEW,
        folder: "faces",
        scan: "old",
        page: 3,
        photo: "a.png",
        cluster: "p1",
        faceNames: { p1: "Ada" },
        filter: { ...DEFAULT_FILTER, minScore: 0.8, faceClusters: ["p1"], scenes: ["beach"] },
      },
      "scenes",
    );
    expect(next.folder).toBe("scenes");
    expect(next.scan).toBeNull();
    expect(next.page).toBe(1);
    expect(next.photo).toBeNull();
    expect(next.cluster).toBeNull();
    expect(next.filter.faceClusters).toEqual([]);
    expect(next.filter.scenes).toEqual([]);
    expect(next.filter.minScore).toBe(0.8);
    expect(next.faceNames).toEqual({});
  });
});

describe("sse", () => {
  it("parses progress and holds a partial frame", () => {
    const chunk = 'event: progress\ndata: {"phase":"scoring","done":1,"total":4}\n\nevent: comp';
    const parsed = parseSseFrames(chunk);
    expect(parsed.events).toEqual([{ event: "progress", data: { phase: "scoring", done: 1, total: 4 } }]);
    expect(parsed.rest.startsWith("event: comp")).toBe(true);
  });
});

describe("age cell with no age", () => {
  const faceless = { face_count: 0 } as ImageResult;
  const faced = { face_count: 1 } as ImageResult;
  it("says why the age is missing", () => {
    // Faces still coming: wait. Detection ran and found none: say so. Detection did not run: nothing to say.
    expect(ageMissing(faceless, ["faces"], true)).toBe("…");
    expect(ageMissing(faceless, [], true)).toBe("no face");
    expect(ageMissing(faceless, [], false)).toBe("–");
    expect(ageMissing(faced, [], true)).toBe("–");
  });
  it("knows face detection ran from the summary or from a face already found", () => {
    expect(facesRan(null)).toBe(false);
    expect(facesRan(summary({ enabled: true }))).toBe(true);
    expect(facesRan(summary({ enabled: false }))).toBe(false);
    // A live scan's batches carry no config; a face in a batch is proof enough.
    expect(facesRan({ ...summary({ enabled: false }), results: [faced] })).toBe(true);
  });
});

describe("set age", () => {
  const set = { years: 16.4, cluster_id: "face_1", faces: 20, share: 0.95 };
  const exposed = { labels: { FEMALE_BREAST_EXPOSED: 0.8 }, exposed_score: 0.8 };
  it("stands in for a measurement on a frame with no face, and only there", () => {
    const body = { face_count: 0, faces: [], primary_face_attributes: null, set_age: set, nsfw: exposed } as unknown as ImageResult;
    const faced = { face_count: 1, faces: [{ attributes: { age_years: 31, age_source: "mivolo" } }], primary_face_attributes: { age_years: 31, age_source: "mivolo" }, set_age: set, nsfw: exposed } as unknown as ImageResult;
    expect(usesSetAge(body)).toBe(true);
    expect(youngestAge(body)).toBe(16.4);
    // Under 18 by the set's age with exposure: held blurred and marked for delete, like a measured face.
    expect(isMinorExposed(body)).toBe(true);
    expect(revealHeld(body, [])).toBe(true);
    expect(shouldBlur(body, [], { exposedScore: 0.25, policyBlur: true, unblurNsfw: true })).toBe(true);
    // A frame with its own face keeps its own age.
    expect(usesSetAge(faced)).toBe(false);
    expect(youngestAge(faced)).toBe(31);
    expect(isMinorExposed(faced)).toBe(false);
    // An adult set age adds no hold.
    const adult = { ...body, set_age: { ...set, years: 24 } } as unknown as ImageResult;
    expect(isMinorExposed(adult)).toBe(false);
    expect(filterByAge([body, adult], 18, null).map((image) => image.set_age?.years)).toEqual([24]);
  });
});

describe("EraX fill-in", () => {
  const blur = { exposedScore: 0.25, policyBlur: true };
  it("keeps a frame blurred when NudeNet failed and EraX alone scored it low", () => {
    const eraxAlone = { nsfw: { labels: { FEMALE_BREAST_EXPOSED: 0.21 }, exposed_score: 0.21 }, erax_filled: true, nudenet_failed: true } as unknown as ImageResult;
    expect(shouldBlur(eraxAlone, [], blur)).toBe(true);
    // Unblur NSFW still reveals it: no under-18 age, so no hold.
    expect(shouldBlur(eraxAlone, [], { ...blur, unblurNsfw: true })).toBe(false);
    // Filled beside a working NudeNet, the score lifts the blur as usual.
    const filled = { ...eraxAlone, nudenet_failed: false } as unknown as ImageResult;
    expect(shouldBlur(filled, [], blur)).toBe(false);
  });
});

describe("body-only ages", () => {
  const exposed = { labels: { FEMALE_BREAST_EXPOSED: 0.8 }, exposed_score: 0.8 };
  const person = (age: number, faceIndex: number | null = null) => ({ bbox: [0, 0, 10, 10], det_score: 0.9, face_index: faceIndex, age_years: age, age_source: "mivolo" });
  it("counts a person with no visible face, and only that person", () => {
    const faceless = { face_count: 0, faces: [], primary_face_attributes: null, people: [person(15)], people_check: "ok", nsfw: exposed } as unknown as ImageResult;
    expect(bodyAges(faceless)).toEqual([15]);
    expect(youngestAge(faceless)).toBe(15);
    expect(isMinorExposed(faceless)).toBe(true);
    expect(revealHeld(faceless, [])).toBe(true);
    expect(shouldBlur(faceless, [], { exposedScore: 0.25, policyBlur: true, unblurNsfw: true })).toBe(true);
    expect(shownAge(faceless)).toEqual({ text: "15y body", title: "Apparent age of a person with no visible face, MiVOLO from the body alone" });
    // A person matched to a face is already counted by the face.
    const matched = { face_count: 1, faces: [{ primary: true, attributes: { age_years: 30, age_source: "mivolo" } }], primary_face_attributes: { age_years: 30, age_source: "mivolo" }, people: [person(16, 0)], nsfw: exposed } as unknown as ImageResult;
    expect(bodyAges(matched)).toEqual([]);
    expect(isMinorExposed(matched)).toBe(false);
  });

  it("only adds holds: a young body beside an adult face still holds, an adult body lifts nothing", () => {
    const mixed = { face_count: 1, faces: [{ primary: true, attributes: { age_years: 30, age_source: "mivolo" } }], primary_face_attributes: { age_years: 30, age_source: "mivolo" }, people: [person(0, 0), person(14)], nsfw: exposed } as unknown as ImageResult;
    expect(youngestAge(mixed)).toBe(14);
    expect(isMinorExposed(mixed)).toBe(true);
    expect(shownAge(mixed)?.text).toBe("14y body");
    const young = { face_count: 1, faces: [{ primary: true, attributes: { age_years: 15, age_source: "mivolo" } }], primary_face_attributes: { age_years: 15, age_source: "mivolo" }, people: [person(40)], nsfw: exposed } as unknown as ImageResult;
    expect(isMinorExposed(young)).toBe(true);
    expect(shownAge(young)?.text).toBe("15y");
  });

  it("outranks the set age: the frame has a reading of its own", () => {
    const set = { years: 30, cluster_id: "face_1", faces: 20, share: 0.95 };
    const image = { face_count: 0, faces: [], primary_face_attributes: null, set_age: set, people: [person(16)], nsfw: exposed } as unknown as ImageResult;
    expect(usesSetAge(image)).toBe(false);
    expect(youngestAge(image)).toBe(16);
    expect(isMinorExposed(image)).toBe(true);
  });
});
