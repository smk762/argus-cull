/**
 * The keep set for the static demo, worked out in the browser from the recorded
 * scan. A port of argus-curator's `decide_selection` (selection.py) without the
 * diversity cap or the face-source preset, which the sidebar does not offer.
 *
 * Hard exclusions (rejects and under-18 exposure) are the curator's own, read
 * from the recorded keep set; everything a sidebar filter decides is tested
 * here, in the curator's order and with its keep reasons, so the default
 * filters give back the recorded keep set exactly (demoSelect.test.ts).
 */
import { contentRating, ruleMatches } from "./moderation";
import { EXPOSED_LABELS, type GuardResult, type ImageResult, type ScanSummary, type SelectRequest, type SelectResult } from "./types";

/** A keep reason no filter can lift: the frame was rejected, or it is under 18 with exposure. */
function hardReason(image: ImageResult, recorded: string | undefined): string | null {
  if (recorded === "minor-exposed") return recorded;
  if (!image.passed) return recorded || image.reject_reason || "rejected";
  return null;
}

function attributeReason(image: ImageResult, req: SelectRequest): string | null {
  const filters = [
    ["gender", req.face_genders],
    ["age", req.face_ages],
  ] as const;
  const active = filters.filter(([, allowed]) => allowed && allowed.length > 0);
  const ageRange = req.min_age_years != null || req.max_age_years != null;
  if (active.length === 0 && !ageRange) return null;
  const attrs = image.primary_face_attributes;
  if (!attrs) return "face-attributes-missing";
  for (const [name, allowed] of active) {
    const value = attrs[name];
    if (value == null) return `face-${name}-missing`;
    if (!(allowed as readonly string[]).includes(value)) return `face-${name}-excluded`;
    const conf = attrs[`${name}_conf`];
    if (conf != null && conf < req.min_attribute_conf) return `face-${name}-low-confidence`;
  }
  if (ageRange) {
    const years = attrs.age_years;
    if (years == null) return "face-age-years-missing";
    if ((req.min_age_years != null && years < req.min_age_years) || (req.max_age_years != null && years > req.max_age_years)) return "face-age-out-of-range";
  }
  return null;
}

function sceneReason(image: ImageResult, req: SelectRequest): string | null {
  const scenes = req.scenes ?? [];
  const environments = req.scene_environments ?? [];
  if (scenes.length === 0 && environments.length === 0) return null;
  const scene = image.scene;
  if (!scene) return "scene-missing";
  if (environments.length > 0) {
    if (!environments.includes(scene.environment)) return "scene-environment-excluded";
    if (scene.environment_conf < req.min_scene_conf) return "scene-environment-low-confidence";
  }
  if (scenes.length > 0) {
    const hits = scene.categories.filter((category) => scenes.includes(category.label));
    if (hits.length === 0) return "scene-excluded";
    if (Math.max(...hits.map((hit) => hit.conf)) < req.min_scene_conf) return "scene-low-confidence";
  }
  return null;
}

function garmentReason(image: ImageResult, req: SelectRequest): string | null {
  const wanted = req.garments ?? [];
  const banned = req.exclude_garments ?? [];
  if (wanted.length === 0 && banned.length === 0) return null;
  if (image.garments == null) return "garments-missing";
  const worn = image.garments.filter((garment) => garment.conf >= req.min_garment_conf);
  if (banned.length > 0 && worn.some((garment) => banned.includes(garment.label))) return "garment-excluded";
  if (wanted.length > 0) {
    const hits = worn.filter((garment) => wanted.includes(garment.label));
    if (hits.length === 0) return image.garments.some((garment) => wanted.includes(garment.label)) ? "garment-low-confidence" : "garment-not-found";
    if (req.garments_uncropped && hits.every((garment) => garment.touches_edge)) return "garment-cropped";
  }
  return null;
}

function nsfwReason(image: ImageResult, req: SelectRequest): string | null {
  const perLabel = Object.entries(req.nsfw_label_thresholds ?? {});
  if (req.nsfw_threshold == null && perLabel.length === 0) return null;
  const nsfw = image.nsfw;
  if (nsfw == null) return "nsfw-unchecked";
  if (req.nsfw_threshold != null) {
    const labels = req.nsfw_exposed_labels ?? EXPOSED_LABELS;
    const score = labels.reduce((max, label) => Math.max(max, nsfw.labels[label] ?? 0), 0);
    if (score >= req.nsfw_threshold) return "nsfw-exposed";
  }
  for (const [label, threshold] of perLabel) if ((nsfw.labels[label] ?? 0) >= threshold) return `nsfw-${label.toLowerCase().replaceAll("_", "-")}`;
  return image.nudenet_failed ? "nsfw-unchecked" : null;
}

function ratingReason(image: ImageResult, req: SelectRequest): string | null {
  if (req.content_ratings == null) return null;
  const rating = contentRating(image);
  if (rating == null) return "nsfw-unchecked";
  return req.content_ratings.includes(rating) ? null : `content-rating:${rating}`;
}

function verdictReason(verdict: GuardResult | null | undefined, req: SelectRequest): string | null {
  if (verdict == null) return "guard-unchecked";
  if (verdict.safe) return null;
  if (req.guard_unsafe) return "guard-unsafe";
  if (verdict.rules.length === 0) return "guard-rule-unknown";
  for (const wanted of req.guard_rules ?? []) {
    if (verdict.rules.some((fired) => ruleMatches(fired, wanted))) return `guard-rule-${wanted.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  }
  return null;
}

function guardReason(image: ImageResult, req: SelectRequest): string | null {
  if (!req.guard_unsafe && !(req.guard_rules && req.guard_rules.length > 0)) return null;
  if (!req.guard_policies || req.guard_policies.length === 0) return verdictReason(image.guard, req);
  for (const name of req.guard_policies) {
    const verdict = image.guard_variants != null ? image.guard_variants[name] : image.guard;
    const reason = verdictReason(verdict, req);
    if (reason != null) return `${reason}:${name}`;
  }
  return null;
}

/** Why the request keeps the frame out, in the curator's words, or "" when it is kept. */
export function demoKeepReason(image: ImageResult, req: SelectRequest, recorded: string | undefined): string {
  const hard = hardReason(image, recorded);
  if (hard != null) return hard;
  if (image.score < req.min_score) return "below-score";
  if (image.is_duplicate && !req.keep_similar) return `similar-to:${image.duplicate_of}`;
  if (req.face_clusters && req.face_clusters.length > 0 && !req.face_clusters.includes(image.primary_face_cluster ?? "")) return "face-cluster-excluded";
  if (req.face_poses && req.face_poses.length > 0 && !(image.primary_face_pose != null && req.face_poses.includes(image.primary_face_pose))) return "face-pose-excluded";
  return attributeReason(image, req) ?? sceneReason(image, req) ?? garmentReason(image, req) ?? nsfwReason(image, req) ?? ratingReason(image, req) ?? guardReason(image, req) ?? "";
}

/** The keep set for any sidebar filters, from the recorded scan and its recorded keep set. */
export function demoSelection(scan: ScanSummary, request: SelectRequest, recorded: SelectResult): SelectResult {
  const recordedReasons = new Map(recorded.rows.map((row) => [row.rel_path, row.keep_reason]));
  const rows = scan.results.map((image) => ({ rel_path: image.rel_path, abs_path: image.abs_path, keep_reason: demoKeepReason(image, request, recordedReasons.get(image.rel_path)) }));
  return { scan_id: scan.scan_id, total: rows.length, kept: rows.filter((row) => row.keep_reason === "").length, rows };
}
