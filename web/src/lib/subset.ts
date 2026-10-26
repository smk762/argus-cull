import { youngestAge } from "./chunks";
import type { FacePose, ImageResult, ScanSummary } from "./types";

export interface SubsetStat {
  label: string;
  value: string;
}

export interface SubsetReport {
  title: string;
  kept: number;
  total: number;
  stats: SubsetStat[];
  notes: string[];
}

const POSES: FacePose[] = ["frontal", "three_quarter", "profile"];

/** Read the keep set against the signals the curator already stored. */
export function evaluateSubset(summary: ScanSummary, reasons: ReadonlyMap<string, string>, floor: number): SubsetReport {
  const kept = summary.results.filter((image) => reasons.get(image.rel_path) === "");
  const category = summary.target_profile?.target_category ?? null;
  const title = category ? `Keep set, for ${categoryLabel(category)} training` : "Keep set, for training";
  if (kept.length === 0) {
    return { title, kept: 0, total: summary.results.length, stats: [], notes: ["Nothing is kept, so there is no training subset to score."] };
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
    const checked = kept.filter((image) => image.guard != null);
    const unsafe = checked.filter((image) => image.guard?.safe === false).length;
    stats.push({ label: "Policy", value: `${unsafe} unsafe of ${checked.length}` });
    if (unsafe > 0) notes.push(`${unsafe} kept ${unsafe === 1 ? "image is" : "images are"} marked unsafe by SingGuard.`);
  }
  if (summary.faces_config.mivolo) {
    const young = kept.filter((image) => {
      const age = youngestAge(image);
      return age != null && age < 18;
    }).length;
    if (young > 0) notes.push(`${young} kept ${young === 1 ? "image has" : "images have"} a MiVOLO age under 18.`);
  }

  if (notes.length === 0) notes.push("No concentration problem stood out in quality, duplicates, identity, pose, or scene spread.");
  return { title, kept: kept.length, total: summary.results.length, stats, notes };
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
