import { describe, expect, it } from "vitest";

import { BODY_POSE_COLLAPSE_SHARE, BODY_POSE_MIN_CLUSTERED, BODY_POSE_NOTE_SHARE, evaluateSubset } from "./subset";
import type { BodyPoseLabels, ImageResult, PoseCheck, PoseSummary, ScanSummary } from "./types";

// Synthetic rows only: the fields evaluateSubset reads, nothing from a real scan.
function row(name: string, cluster: number | null, check: PoseCheck | null = cluster == null ? null : "ok", labels: BodyPoseLabels | null = null): ImageResult {
  return {
    rel_path: name,
    score: 0.9,
    passed: true,
    is_duplicate: false,
    sharpness: 400,
    width: 1024,
    height: 1024,
    face_count: 1,
    primary_face_cluster: null,
    primary_face_pose: null,
    pose_check: check,
    pose_cluster: cluster,
    pose_labels: labels,
  } as unknown as ImageResult;
}

function rows(prefix: string, count: number, cluster: number | null, check?: PoseCheck | null, labels?: BodyPoseLabels | null): ImageResult[] {
  return Array.from({ length: count }, (_, index) => row(`${prefix}${index}.jpg`, cluster, check, labels));
}

const POSE: PoseSummary = {
  puppet_version: "1.1",
  posed: 0,
  no_person: 0,
  failed: 0,
  skipped: null,
  usable: 0,
  comparable_share: 1,
  diversity: 0.5,
  largest_cluster_share: 0.5,
  clusters: [
    { id: 0, size: 10, share: 0.5, medoid_rel_path: "a0.jpg" },
    { id: 1, size: 10, share: 0.5, medoid_rel_path: "gone.jpg" },
  ],
  stale: false,
};

function scan(results: ImageResult[], category: string | null = null, pose: PoseSummary | null = POSE, enabled: boolean | null = true): ScanSummary {
  return {
    results,
    faces_config: { enabled: false },
    scenes_config: { enabled: false },
    garments_config: { enabled: false },
    pose_config: { enabled },
    pose,
    target_profile: { target_category: category },
  } as unknown as ScanSummary;
}

function evaluate(summary: ScanSummary, left: string[] = []) {
  const out = new Set(left);
  return evaluateSubset(summary, new Map(summary.results.map((image) => [image.rel_path, out.has(image.rel_path) ? "below-score" : ""])), 0.6);
}

const bodyNote = (notes: string[]) => notes.find((note) => note.includes("share one pose"));
const STANDING: BodyPoseLabels = { stance: "standing", arms: "down", facing: "front" };

describe("keep set body pose", () => {
  it("keeps the thresholds in order", () => {
    expect(BODY_POSE_MIN_CLUSTERED).toBe(10);
    expect(BODY_POSE_NOTE_SHARE).toBe(0.4);
    expect(BODY_POSE_COLLAPSE_SHARE).toBe(0.75);
  });

  it("notes at 40%, not below, and names the dominant pose's known labels", () => {
    const below = evaluate(scan([...rows("a", 3, 0, "ok", STANDING), ...rows("b", 3, 1), ...rows("c", 2, 2), ...rows("d", 2, 3)]));
    expect(bodyNote(below.notes)).toBeUndefined();
    expect(below.stats.find((stat) => stat.label === "Body poses")?.value).toBe("4 on 10 frames, largest 30%");

    const at = evaluate(scan([...rows("a", 4, 0, "ok", STANDING), ...rows("b", 3, 1), ...rows("c", 3, 2)]));
    expect(bodyNote(at.notes)).toBe("40% of the kept frames with a measured body pose share one pose (standing, arms down, facing front). More varied poses would spread what the model learns.");
    expect(at.frames).toEqual([{ label: "The most central frame of that pose", relPath: "a0.jpg" }]);
  });

  it("says the keep set collapsed at 75%", () => {
    const report = evaluate(scan([...rows("a", 8, 0, "ok", STANDING), ...rows("b", 2, 1)]));
    expect(bodyNote(report.notes)).toMatch(/^80% .*\(standing, arms down, facing front\)\. The keep set has collapsed onto it/);
    const under = evaluate(scan([...rows("a", 7, 0), ...rows("b", 3, 1)]));
    expect(bodyNote(under.notes)).toMatch(/^70% .*More varied poses/);
  });

  it("counts only kept rows with a cluster, leaving null clusters out of the share", () => {
    // 10 clustered (6 in cluster 1), plus 2 kept with no cluster: 60%, not 50%.
    const results = [...rows("b", 6, 1), ...rows("a", 4, 0), row("u.jpg", null, "unusable"), row("n.jpg", null, "no_person"), ...rows("x", 5, 0)];
    const report = evaluate(scan(results), results.filter((image) => image.rel_path.startsWith("x")).map((image) => image.rel_path));
    expect(report.kept).toBe(12);
    expect(bodyNote(report.notes)).toMatch(/^60% of the kept frames with a measured body pose share one pose\./);
    // Cluster 1's medoid is not in the scan any more, so no frame is offered.
    expect(report.frames).toEqual([]);
  });

  it("names only labels that are not unknown, and none when all are", () => {
    const mixed = evaluate(scan([...rows("a", 9, 0, "ok", { stance: "unknown", arms: "up", facing: "unknown" }), row("b.jpg", 1)]));
    expect(bodyNote(mixed.notes)).toMatch(/share one pose \(arms up\)\./);
    const unknown = evaluate(scan([...rows("a", 9, 0, "ok", { stance: "unknown", arms: "unknown", facing: "unknown" }), row("b.jpg", 1)]));
    expect(bodyNote(unknown.notes)).toMatch(/share one pose\. /);
    expect(unknown.notes.join(" ")).not.toMatch(/null|unknown|undefined/);
  });

  it("gives no concentration note under 10 clustered frames, and says why", () => {
    const report = evaluate(scan([...rows("a", 9, 0), ...rows("n", 3, null, "no_person"), row("f.jpg", null, "failed"), row("q.jpg", null, null)]));
    expect(bodyNote(report.notes)).toBeUndefined();
    expect(report.notes).toContain("5 of 14 kept frames have no measured body pose (3 no person, 1 check failed, 1 not checked), so the 9 that do are too few to judge body-pose spread.");
  });

  it("says how much of the keep set was not measured when it is a large part", () => {
    const large = evaluate(scan([...rows("a", 10, 0), ...rows("u", 3, null, "unusable"), ...rows("k", 1, null, "ok")]));
    expect(large.notes).toContain("4 of 14 kept frames have no measured body pose (3 too few visible joints, 1 not clustered), so the body-pose share covers only the other 10.");
    const small = evaluate(scan([...rows("a", 10, 0), ...rows("u", 3, null, "unusable")]));
    expect(small.notes.some((note) => note.includes("no measured body pose"))).toBe(false);
  });

  it("applies to every target category", () => {
    for (const category of [null, "identity", "pose_composition", "wardrobe", "setting", "style"]) {
      expect(bodyNote(evaluate(scan([...rows("a", 9, 0), row("b.jpg", 1)], category)).notes)).toBeDefined();
    }
  });

  it("adds nothing when the scan has no pose data", () => {
    const results = [...rows("a", 10, null, null)];
    for (const summary of [scan(results, null, null, null), scan(results, null, null, false), { ...scan(results), pose_config: undefined, pose: undefined } as ScanSummary]) {
      const report = evaluate(summary);
      expect(report.stats.some((stat) => stat.label === "Body poses")).toBe(false);
      expect(report.notes.some((note) => /body pose/i.test(note))).toBe(false);
      expect(report.frames).toEqual([]);
    }
  });

  it("says nothing about spread when the scan was not clustered beyond the unmeasured count", () => {
    const report = evaluate(scan(rows("a", 12, null, "ok", STANDING), null, { ...POSE, skipped: "too many images", clusters: [] }));
    expect(bodyNote(report.notes)).toBeUndefined();
    expect(report.notes).toContain("12 of 12 kept frames have no measured body pose (12 not clustered), so body-pose spread is not known.");
  });
});
