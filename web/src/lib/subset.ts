import { youngestAge } from "./chunks";
import { effectiveUnsafe } from "./policies";
import type { BodyPoseLabels, FacePose, ImageResult, ScanSummary } from "./types";

export interface SubsetStat {
  label: string;
  value: string;
}

/** A frame a note points at, which the dialog can open. */
export interface SubsetFrame {
  label: string;
  relPath: string;
}

export interface SubsetReport {
  title: string;
  kept: number;
  total: number;
  stats: SubsetStat[];
  notes: string[];
  frames: SubsetFrame[];
}

const POSES: FacePose[] = ["frontal", "three_quarter", "profile"];

// Body pose (argus-puppet clusters, formed over the whole scan). These cut-offs are
// uncalibrated on real keep sets: the strong one is argus-puppet's and argus-proof's
// collapse cut-off, the plain one an early warning below it.
/** Fewest kept frames with a body-pose cluster before their spread is judged (the head-pose minimum). */
export const BODY_POSE_MIN_CLUSTERED = 10;
/** Largest body-pose cluster's share of the clustered kept frames that earns a note. */
export const BODY_POSE_NOTE_SHARE = 0.4;
/** The share at which the note says the keep set has collapsed onto one pose. */
export const BODY_POSE_COLLAPSE_SHARE = 0.75;
/** Share of the keep set with no body-pose cluster at which the note says how many were not measured. */
export const BODY_POSE_UNMEASURED_SHARE = 0.25;

/** Read the keep set against the signals the curator already stored. */
export function evaluateSubset(summary: ScanSummary, reasons: ReadonlyMap<string, string>, floor: number): SubsetReport {
  const kept = summary.results.filter((image) => reasons.get(image.rel_path) === "");
  const category = summary.target_profile?.target_category ?? null;
  const title = category ? `Keep set, for ${categoryLabel(category)} training` : "Keep set, for training";
  if (kept.length === 0) {
    return { title, kept: 0, total: summary.results.length, stats: [], notes: ["Nothing is kept, so there is no training subset to score."], frames: [] };
  }

  const scores = kept.map((image) => image.score);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const nearFloor = scores.filter((score) => score < floor + 0.05).length;
  const stats: SubsetStat[] = [
    { label: "Kept", value: `${kept.length} of ${summary.results.length}` },
    { label: "Mean quality", value: mean.toFixed(2) },
    { label: "Median sharpness", value: median(kept.map((image) => image.sharpness)).toFixed(0) },
    { label: "Median short side", value: `${Math.round(median(kept.map((image) => Math.min(image.width, image.height))))} px` },
  ];
  const notes: string[] = [];
  const frames: SubsetFrame[] = [];
  if (nearFloor > 0) {
    notes.push(`${nearFloor} kept ${nearFloor === 1 ? "image is" : "images are"} within 0.05 of the ${floor.toFixed(2)} quality floor.`);
  }

  const duplicates = kept.filter((image) => image.is_duplicate).length;
  if (duplicates > 0) {
    notes.push(`${duplicates} near-duplicate ${duplicates === 1 ? "image is" : "images are"} still in the keep set. Each repeats a frame instead of adding a new one.`);
  }
  const hardRejects = kept.filter((image) => !image.passed).length;
  if (hardRejects > 0) notes.push(`${hardRejects} kept ${hardRejects === 1 ? "image" : "images"} failed the blur, size, or aspect check.`);

  if (summary.faces_config.enabled) {
    const none = kept.filter((image) => image.face_count === 0).length;
    const one = kept.filter((image) => image.face_count === 1).length;
    stats.push({ label: "Faces", value: `${one} single · ${kept.length - one - none} group · ${none} none` });
    const byCluster = new Map<string, number>();
    for (const image of kept) {
      if (!image.primary_face_cluster) continue;
      byCluster.set(image.primary_face_cluster, (byCluster.get(image.primary_face_cluster) ?? 0) + 1);
    }
    const largest = Math.max(0, ...byCluster.values());
    const identified = [...byCluster.values()].reduce((sum, count) => sum + count, 0);
    if (byCluster.size > 0) {
      stats.push({ label: "Identities", value: `${byCluster.size}, largest ${share(largest, identified)}` });
    }
    if (category === "identity" && byCluster.size > 1 && largest / identified < 0.5) {
      notes.push(`The keep set splits across ${byCluster.size} identities. Identity training usually wants one subject to dominate.`);
    }
    if (none / kept.length >= 0.3 && (category === "identity" || category === "wardrobe")) {
      notes.push(`${none} kept ${none === 1 ? "image has" : "images have"} no face.`);
    }
    const posed = kept.filter((image) => image.primary_face_pose != null);
    if (posed.length >= 10) {
      const counts = POSES.map((pose) => posed.filter((image) => image.primary_face_pose === pose).length);
      const top = Math.max(...counts);
      const name = POSES[counts.indexOf(top)].replaceAll("_", " ");
      stats.push({ label: "Poses", value: POSES.map((pose, index) => `${pose.replaceAll("_", " ")} ${counts[index]}`).join(" · ") });
      if (top / posed.length >= 0.8 && (category === "identity" || category === "pose_composition" || category == null)) {
        notes.push(`${share(top, posed.length)} of the posed frames are ${name}.`);
      }
    }
  }

  // Every category: body-pose collapse skews any training set (argus-proof gates it for all).
  bodyPose(summary, kept, stats, notes, frames);

  if (summary.scenes_config.enabled) {
    const labels = kept.map(topScene).filter((label): label is string => label != null);
    const distinct = new Set(labels).size;
    if (labels.length > 0) stats.push({ label: "Scenes", value: `${distinct} labels on ${labels.length} frames` });
    if (labels.length >= 10 && distinct <= 2 && (category === "setting" || category == null)) {
      notes.push(`Scenes repeat: ${distinct} ${distinct === 1 ? "label covers" : "labels cover"} ${labels.length} tagged frames.`);
    }
  }

  if (summary.garments_config.enabled) {
    const tagged = kept.filter((image) => (image.garments?.length ?? 0) > 0);
    const distinct = new Set(tagged.flatMap((image) => (image.garments ?? []).map((garment) => garment.label))).size;
    if (tagged.length > 0) stats.push({ label: "Garments", value: `${distinct} types on ${tagged.length} frames` });
    if (category === "wardrobe" && tagged.length / kept.length < 0.5) {
      const untagged = kept.length - tagged.length;
      notes.push(`${untagged} kept ${untagged === 1 ? "image has" : "images have"} no garment detection.`);
    }
  }

  if (summary.nsfw_config?.enabled) {
    const checked = kept.filter((image) => image.nsfw != null);
    const exposed = checked.filter((image) => (image.nsfw?.exposed_score ?? 0) >= 0.2).length;
    stats.push({ label: "Exposed", value: `${exposed} of ${checked.length} at 0.2 or above` });
  }
  if (summary.guard_config?.enabled) {
    const checked = kept.filter((image) => effectiveUnsafe(image) != null);
    const unsafe = checked.filter((image) => effectiveUnsafe(image) === true).length;
    stats.push({ label: "Policy", value: `${unsafe} unsafe of ${checked.length}` });
    if (unsafe > 0) notes.push(`${unsafe} kept ${unsafe === 1 ? "image is" : "images are"} marked unsafe by a SingGuard policy.`);
  }
  if (summary.faces_config.mivolo) {
    const young = kept.filter((image) => {
      const age = youngestAge(image);
      return age != null && age < 18;
    }).length;
    if (young > 0) notes.push(`${young} kept ${young === 1 ? "image has" : "images have"} a MiVOLO age under 18.`);
  }

  if (notes.length === 0) notes.push("No concentration problem stood out in quality, duplicates, identity, pose, or scene spread.");
  return { title, kept: kept.length, total: summary.results.length, stats, notes, frames };
}

/**
 * The keep set's share in one body pose. Clusters span the whole scan, so the
 * share is counted here: kept rows by `pose_cluster`, null clusters left out.
 * Nothing is added when the scan has no pose data.
 */
function bodyPose(summary: ScanSummary, kept: ImageResult[], stats: SubsetStat[], notes: string[], frames: SubsetFrame[]): void {
  if (!summary.pose_config?.enabled || !summary.pose) return;
  const byCluster = new Map<number, ImageResult[]>();
  for (const image of kept) {
    if (image.pose_cluster == null) continue;
    byCluster.set(image.pose_cluster, [...(byCluster.get(image.pose_cluster) ?? []), image]);
  }
  const clustered = [...byCluster.values()].reduce((sum, rows) => sum + rows.length, 0);
  let topId = -1;
  let top: ImageResult[] = [];
  for (const [id, rows] of byCluster) {
    // Ties go to the lower id, the larger cluster over the whole scan.
    if (rows.length > top.length || (rows.length === top.length && id < topId)) [topId, top] = [id, rows];
  }
  if (clustered > 0) {
    stats.push({ label: "Body poses", value: `${byCluster.size} on ${clustered} frames, largest ${share(top.length, clustered)}` });
  }

  if (clustered >= BODY_POSE_MIN_CLUSTERED && top.length / clustered >= BODY_POSE_NOTE_SHARE) {
    const labels = dominantLabels(top);
    const named = labels ? ` (${labels})` : "";
    const lead = `${share(top.length, clustered)} of the kept frames with a measured body pose share one pose${named}`;
    notes.push(
      top.length / clustered >= BODY_POSE_COLLAPSE_SHARE
        ? `${lead}. The keep set has collapsed onto it, and a model trained on it will tend to repeat that pose.`
        : `${lead}. More varied poses would spread what the model learns.`,
    );
    const medoid = summary.pose.clusters.find((cluster) => cluster.id === topId)?.medoid_rel_path;
    if (medoid && summary.results.some((image) => image.rel_path === medoid)) {
      frames.push({ label: "The most central frame of that pose", relPath: medoid });
    }
  }

  const unmeasured = kept.length - clustered;
  if (unmeasured > 0 && unmeasured / kept.length >= BODY_POSE_UNMEASURED_SHARE) {
    const why = unmeasuredReasons(kept.filter((image) => image.pose_cluster == null));
    const verb = unmeasured === 1 ? "has" : "have";
    const enough =
      clustered === 0
        ? ", so body-pose spread is not known."
        : clustered < BODY_POSE_MIN_CLUSTERED
          ? `, so the ${clustered} that ${clustered === 1 ? "does is" : "do are"} too few to judge body-pose spread.`
          : `, so the body-pose share covers only the other ${clustered}.`;
    notes.push(`${unmeasured} of ${kept.length} kept frames ${verb} no measured body pose (${why})${enough}`);
  }
}

const STANCE_NAMES: Record<BodyPoseLabels["stance"], string | null> = {
  standing: "standing",
  jumping: "jumping",
  crouching: "crouching",
  seated: "seated",
  lying: "lying",
  unknown: null,
};
const ARMS_NAMES: Record<BodyPoseLabels["arms"], string | null> = { up: "arms up", out: "arms out", down: "arms down", mixed: "mixed arms", unknown: null };
const FACING_NAMES: Record<BodyPoseLabels["facing"], string | null> = {
  front: "facing front",
  back: "facing away",
  left: "facing left",
  right: "facing right",
  unknown: null,
};

/** The most common known stance, arms and facing in a cluster's kept rows; null when none is known. */
function dominantLabels(rows: ImageResult[]): string | null {
  const parts = [
    mostCommon(rows.map((image) => STANCE_NAMES[image.pose_labels?.stance ?? "unknown"] ?? null)),
    mostCommon(rows.map((image) => ARMS_NAMES[image.pose_labels?.arms ?? "unknown"] ?? null)),
    mostCommon(rows.map((image) => FACING_NAMES[image.pose_labels?.facing ?? "unknown"] ?? null)),
  ].filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(", ") : null;
}

function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let most = 0;
  for (const [value, count] of counts) {
    if (count > most) [best, most] = [value, count];
  }
  return best;
}

const UNMEASURED_REASONS: [string, (image: ImageResult) => boolean][] = [
  ["no person", (image) => image.pose_check === "no_person"],
  ["too few visible joints", (image) => image.pose_check === "unusable"],
  ["check failed", (image) => image.pose_check === "failed"],
  ["not checked", (image) => image.pose_check == null],
  ["not clustered", (image) => image.pose_check === "ok"],
];

function unmeasuredReasons(rows: ImageResult[]): string {
  return UNMEASURED_REASONS.map(([label, test]) => [label, rows.filter(test).length] as const)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}`)
    .join(", ");
}

function categoryLabel(category: string): string {
  if (category === "pose_composition") return "pose";
  return category.replaceAll("_", " ");
}

function share(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((100 * part) / whole)}%`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function topScene(image: ImageResult): string | null {
  const label = image.scene?.categories[0]?.label;
  return label && label.length > 0 ? label : null;
}
