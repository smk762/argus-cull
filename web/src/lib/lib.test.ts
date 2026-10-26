import { describe, expect, it } from "vitest";

import { contentRatingAvailable, detectorGroups, policyAvailable } from "./detectors";
import { exposedLabelsForRequest, isSensitive, recordedGuardRules } from "./moderation";
import { exportedAbsPathList, exportBody, keptPathList, selectionJsonl } from "./paths";
import { availability, recordedScenes, scanBody, selectBody } from "./select";
import { parseSseFrames } from "./sse";
import { DEFAULT_FILTER, DEFAULT_VIEW, EXPOSED_LABELS, type Detectors, type FilterState, type ScanSummary } from "./types";
import { parseView, serializeView } from "./urlState";

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
    expect(once.filter.guardRules).toEqual(["A"]);
  });

  it("ignores an exposed threshold NudeNet cannot report", () => {
    expect(parseView(new URLSearchParams("nsfw=0.1")).filter.nsfwThreshold).toBeNull();
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
    expect(scanBody("shoots", { ...NONE, fairface: true }).faces.enabled).toBe(true);
    expect(scanBody("", DETECTORS).garments.enabled).toBe(true);
    expect(scanBody("shoots", NONE).nsfw).toEqual({ enabled: false });
    expect(scanBody("shoots", NONE).guard).toEqual({ enabled: false });
    expect(scanBody("shoots", { ...NONE, nudenet: true, singguard: true }).nsfw.enabled).toBe(true);
    expect(scanBody("shoots", { ...NONE, nudenet: true, singguard: true }).guard.enabled).toBe(true);
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
  });
});

function openGates() {
  return availability(DETECTORS, null);
}

describe("detectors", () => {
  it("names the convert command for a missing ONNX model", () => {
    const fairface = detectorGroups({ ...DETECTORS, fairface: false }).find((group) => group.id === "fairface");
    expect(fairface?.ready).toBe(false);
    expect(fairface?.hint).toContain("fairface-convert");
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
  });

  it("keeps default SingGuard letters and adds a custom rule", () => {
    const scan = summary({ guard: true });
    scan.results[0].guard = { safe: false, rules: ["A. Sexual Content Risk", "house style"] };
    expect(recordedGuardRules(scan, ["A", "B"])).toEqual(["house style"]);
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
