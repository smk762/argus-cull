import { effectiveUnsafe } from "./policies";
import { EXPOSED_LABELS, type GuardResult, type GuardVariants, type ImageResult, type ScanChunk, type ScanSummary } from "./types";

/** MiVOLO ages under this, with any reported exposed detection, stay blurred and are never kept. */
export const MINOR_AGE_YEARS = 18;
/** NudeNet reports nothing under this, so an exposed score here is a real detection. */
export const MINOR_EXPOSED_SCORE = 0.2;

/** Lift the blur once NudeNet is under this exposed score. Policy can put it back. */
export const DEFAULT_BLUR_EXPOSED_SCORE = 0.25;

export interface BlurPolicy {
  exposedScore: number;
  /** When false, an unsafe policy verdict does not blur the image. */
  policyBlur: boolean;
  /** Reveal NudeNet and policy blur. A MiVOLO age under 18 keeps its blur. */
  unblurNsfw?: boolean;
}

export const DEFAULT_BLUR: BlurPolicy = { exposedScore: DEFAULT_BLUR_EXPOSED_SCORE, policyBlur: true };

export type GridSort = "scanned" | "filename" | "quality" | "nsfw" | "policy" | "age" | "pose" | "cluster";

/** Sorts that read naturally A to Z (or first to last) and start ascending. */
export const ASCENDING_SORTS: readonly GridSort[] = ["filename", "pose"];
/** Grid display. Kept and left out follow the current keep set and do not change it. */
export type KeepView = "all" | "kept" | "left-out";
export type SortDirection = "desc" | "asc";

export function blurFromEnv(env: Record<string, string | undefined>): BlurPolicy {
  const raw = env.ARGUS_CULL_BLUR_EXPOSED_SCORE;
  const parsed = raw == null || raw.trim() === "" ? DEFAULT_BLUR_EXPOSED_SCORE : Number(raw);
  const exposedScore = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_BLUR_EXPOSED_SCORE;
  const policy = (env.ARGUS_CULL_POLICY_BLUR ?? "1").trim().toLowerCase();
  const policyBlur = !["0", "false", "off", "no", ""].includes(policy);
  return { exposedScore, policyBlur };
}

const EMPTY_SUMMARY: Omit<ScanSummary, "scan_id" | "folder" | "total" | "results"> = {
  faces_config: { enabled: false, fairface: false, mivolo: false },
  scenes_config: { enabled: false },
  garments_config: { enabled: false, min_conf: 0.5 },
  nsfw_config: { enabled: false },
  guard_config: { enabled: false },
  passed: 0,
  rejected: 0,
  duplicates: 0,
  face_clusters: [],
};

/** Fold a scan batch into the images already on screen. Later batches replace the same path. */
export function mergeChunk(current: ScanSummary | null, chunk: ScanChunk): ScanSummary {
  const order: string[] = [];
  const byPath = new Map<string, ImageResult>();
  for (const image of current?.results ?? []) {
    order.push(image.rel_path);
    byPath.set(image.rel_path, image);
  }
  for (const image of chunk.results) {
    if (!byPath.has(image.rel_path)) order.push(image.rel_path);
    byPath.set(image.rel_path, image);
  }
  const results = order.map((rel) => byPath.get(rel) as ImageResult);
  return {
    ...(current ?? EMPTY_SUMMARY),
    scan_id: chunk.scan_id,
    folder: chunk.folder,
    total: Math.max(chunk.total, results.length, current?.total ?? 0),
    face_clusters: chunk.face_clusters ?? current?.face_clusters ?? [],
    results,
  };
}

function mivoloYears(attrs: { age_years?: number | null; age_source?: string | null } | null | undefined): number | null {
  if (attrs?.age_years == null) return null;
  if (attrs.age_source != null && attrs.age_source !== "mivolo") return null;
  return attrs.age_years;
}

type AgedFace = { age_years?: number | null; age_source?: string | null } | null;

type AgeChecked = {
  nsfw?: { labels?: Record<string, number>; exposed_score?: number; detections?: unknown } | null;
  guard?: GuardResult | null;
  guard_variants?: GuardVariants;
  primary_face_attributes?: AgedFace;
  faces?: { primary?: boolean; attributes?: AgedFace }[] | null;
  set_age?: { years: number } | null;
  people?: { face_index?: number | null; age_years?: number | null; age_source?: string | null }[] | null;
};

/**
 * The ages the under-18 rules read: every face's MiVOLO years, every person
 * with no visible face that MiVOLO read from the body (curator 0.10,
 * `faces.mivolo_body`), and, on a frame with neither, the set's age when the
 * scan gave it one. A body-only age and the set age are weaker readings than
 * a face, but without them the frame had no age at all, so counting them can
 * only add a hold or a delete mark, never lift one. The curator also pairs
 * each age with the exposure on the same person's box; cull has no boxes, so
 * any young age with exposure holds the frame.
 */
export function mivoloAges(image: AgeChecked): number[] {
  const measured = [...measuredAges(image), ...bodyAges(image)];
  if (measured.length === 0 && image.set_age) return [image.set_age.years];
  return measured;
}

/** MiVOLO ages of people with no visible face, read from the body alone. People matched to a face are already counted by the face. */
export function bodyAges(image: Pick<AgeChecked, "people">): number[] {
  return (image.people ?? [])
    .filter((person) => person.face_index == null)
    .map((person) => mivoloYears(person))
    .filter((age): age is number => age != null);
}

/**
 * One MiVOLO reading per face. `faces` lists the primary face too when it
 * marks one as primary, so the primary attributes are added only when the
 * list does not; a record with no face list has the primary reading alone.
 */
export function measuredAges(image: Pick<AgeChecked, "primary_face_attributes" | "faces">): number[] {
  const faces = image.faces ?? [];
  const ages = faces.map((face) => mivoloYears(face.attributes)).filter((age): age is number => age != null);
  const primary = mivoloYears(image.primary_face_attributes);
  if (primary != null && !faces.some((face) => face.primary)) ages.unshift(primary);
  return ages;
}

/** The set age stands in for a measurement: the frame has no face of its own and the scan gave it the set's age. */
export function usesSetAge(image: AgeChecked): boolean {
  if (!image.set_age || bodyAges(image).length > 0) return false;
  return mivoloYears(image.primary_face_attributes) == null && !(image.faces ?? []).some((face) => mivoloYears(face.attributes) != null);
}

function hasMinorAge(image: AgeChecked): boolean {
  return mivoloAges(image).some((age) => age < MINOR_AGE_YEARS);
}

/** The strongest exposed reading NudeNet gave: the highest exposed class or the exposed score. Zero before it reports. */
function exposedReading(image: AgeChecked): number {
  if (image.nsfw == null) return 0;
  const labels = image.nsfw.labels;
  const fromLabels = EXPOSED_LABELS.reduce((max, label) => Math.max(max, labels?.[label] ?? 0), 0);
  return Math.max(fromLabels, image.nsfw.exposed_score ?? 0);
}

/** Any face MiVOLO puts under 18, once an exposed class scores at least 0.2. */
export function isMinorExposed(image: AgeChecked): boolean {
  if (image.nsfw == null) return false;
  if (exposedReading(image) < MINOR_EXPOSED_SCORE) return false;
  return hasMinorAge(image);
}

/** A MiVOLO age under 18 whose NudeNet result has not landed yet. */
export function minorAwaitingNude(image: AgeChecked, pending: readonly string[]): boolean {
  if (!pending.includes("nsfw") || image.nsfw != null) return false;
  return hasMinorAge(image);
}

/**
 * The ages are still coming for a frame with no age yet. Only the curator
 * that lists `faces` in `pending_checks` says so; an older one runs faces
 * before NudeNet, so by the time NudeNet reports the ages are known.
 */
function ageStillComing(image: AgeChecked, pending: readonly string[]): boolean {
  return pending.includes("faces") && mivoloAges(image).length === 0;
}

/**
 * Checks this frame is still waiting on, for a "scanning" mark: NudeNet when
 * it has not reported, and the ages while face detection runs. Policy is left
 * out, since a verdict can only put a blur back, never hold one.
 */
export function awaitingChecks(image: AgeChecked, pending: readonly string[]): boolean {
  if (pending.includes("nsfw") && image.nsfw == null) return true;
  return ageStillComing(image, pending);
}

/**
 * The blur no setting or click lifts: an under-18 face with exposure, and the
 * frames whose under-18 status is not known yet. That is a frame NudeNet has
 * not reported on while it is running, and, while face detection is running,
 * a frame with no age yet whose exposed reading is 0.2 or more. Under 0.2
 * the under-18 rule cannot apply, so the age is not waited for.
 */
export function revealHeld(image: AgeChecked, pending: readonly string[]): boolean {
  if (isMinorExposed(image)) return true;
  if (minorAwaitingNude(image, pending)) return true;
  if (pending.includes("nsfw") && image.nsfw == null) return true;
  return ageStillComing(image, pending) && exposedReading(image) >= MINOR_EXPOSED_SCORE;
}

/**
 * Blur until NudeNet reports. A score under the line lifts it immediately, even
 * while policy is still running. An unsafe policy verdict puts it back, unless
 * that re-blur is opted out; the verdict is the union of every policy the scan
 * ran, or the one policy an override names. An under-18 face with an exposed score stays blurred.
 * Unblur NSFW reveals NudeNet and policy blur on frames NudeNet has already
 * scored, and leaves every under-18 face blurred. A frame NudeNet has not
 * reached stays blurred either way. While face detection is still running,
 * a frame with no age yet and an exposed reading of 0.2 or more stays
 * blurred too: it may still turn out to be an under-18 one. Under 0.2 the
 * under-18 rule cannot apply, so the age is not waited for.
 */
export function shouldBlur(image: AgeChecked, pending: readonly string[], blur: BlurPolicy = DEFAULT_BLUR, policyOverride: string | null = null): boolean {
  if (revealHeld(image, pending)) return true;
  if (blur.unblurNsfw && !hasMinorAge(image)) return false;
  const score = image.nsfw?.exposed_score;
  if (score != null && score >= blur.exposedScore) return true;
  if (blur.policyBlur && effectiveUnsafe(image, policyOverride) === true) return true;
  return false;
}

/** Youngest MiVOLO age on the image, counting every face and every body-only person. FairFace brackets are not years. */
export function youngestAge(image: AgeChecked): number | null {
  const years = mivoloAges(image);
  return years.length > 0 ? Math.min(...years) : null;
}

/**
 * The age a tile or summary shows, and the line behind it. Always the
 * youngest face: the under-18 rule reads the youngest, so the number on
 * screen is the number the rule read, and a younger second face is never
 * hidden behind an older primary one. A person with no visible face counts
 * by the body-only reading. A frame with neither shows the set's age when it
 * has one; a FairFace bracket stands in when MiVOLO did not run.
 * Null when there is no age at all; `ageMissing` says why.
 */
export function shownAge(image: AgeChecked & { primary_face_attributes?: { age?: string | null } | null }): { text: string; title: string } | null {
  if (usesSetAge(image) && image.set_age) {
    return { text: `≈${Math.round(image.set_age.years)}y set`, title: "No face in this frame; the set's median MiVOLO age stands in" };
  }
  const measured = measuredAges(image);
  const bodies = bodyAges(image);
  if (bodies.length > 0 && (measured.length === 0 || Math.min(...bodies) < Math.min(...measured))) {
    const youngest = Math.min(...bodies);
    const who = bodies.length === 1 ? "a person with no visible face" : `the youngest of ${bodies.length} people with no visible face`;
    const faces = measured.length > 0 ? `, younger than the ${measured.length === 1 ? "face" : `${measured.length} faces`}` : "";
    return { text: `${Math.round(youngest)}y body`, title: `Apparent age of ${who}, MiVOLO from the body alone${faces}` };
  }
  if (measured.length > 0) {
    const youngest = Math.min(...measured);
    const primary = mivoloYears(image.primary_face_attributes);
    const text = `${Math.round(youngest)}y`;
    if (measured.length > 1 && primary != null && primary > youngest) {
      return { text, title: `Youngest of ${measured.length} faces, MiVOLO. The primary face reads ${Math.round(primary)}y.` };
    }
    return { text, title: measured.length > 1 ? `Youngest of ${measured.length} faces, MiVOLO` : "Apparent age, MiVOLO years" };
  }
  const bracket = image.primary_face_attributes?.age;
  return bracket ? { text: bracket, title: "FairFace age bracket of the primary face" } : null;
}

/** Hide kept or left-out images. An unknown reason, or a missing selection, leaves the list unchanged. */
export function filterByKeep(images: ImageResult[], reasons: ReadonlyMap<string, string> | null, view: KeepView): ImageResult[] {
  if (view === "all" || reasons == null) return images;
  return images.filter((image) => {
    const kept = reasons.get(image.rel_path) === "";
    return view === "kept" ? kept : !kept;
  });
}

/**
 * Face detection has reported on this scan: the summary says it ran, or a
 * batch already carries a face. A live scan's batches do not carry the
 * config, so the faces found so far stand in for it.
 */
export function facesRan(summary: Pick<ScanSummary, "faces_config" | "results"> | null): boolean {
  if (!summary) return false;
  return summary.faces_config.enabled || summary.results.some((image) => image.face_count > 0);
}

/**
 * What the age cell says when there is no age: "…" while the faces are still
 * coming, "no face" when detection ran and found none, "–" when it did not run.
 * A frame with no face has no MiVOLO estimate, which is worth seeing as such:
 * the frames with the least to go on are often the most explicit ones.
 */
export function ageMissing(image: Pick<ImageResult, "face_count">, pending: readonly string[], ran: boolean): "…" | "no face" | "–" {
  // A frame with a set age is not missing one; callers show that first.
  if (pending.includes("faces")) return "…";
  if (ran && image.face_count === 0) return "no face";
  return "–";
}

export type FaceView = "all" | "none" | "some";

/** Keep only images with no detected face, or only those with one. */
export function filterByFaces(images: ImageResult[], view: FaceView): ImageResult[] {
  if (view === "all") return images;
  return images.filter((image) => (view === "none" ? image.face_count === 0 : image.face_count > 0));
}

/** Hide images outside the youngest-age range. An empty bound is open. Images with no MiVOLO age drop out once either bound is set. */
export function filterByAge(images: ImageResult[], minAge: number | null, maxAge: number | null): ImageResult[] {
  if (minAge == null && maxAge == null) return images;
  return images.filter((image) => {
    const age = youngestAge(image);
    if (age == null) return false;
    if (minAge != null && age < minAge) return false;
    if (maxAge != null && age > maxAge) return false;
    return true;
  });
}

/**
 * Order the gallery. Descending puts the highest value first: quality, NudeNet score,
 * policy issues, oldest ages, the largest face cluster, Z to A file names, and profile
 * before frontal. Ascending flips those. Images with no value (no face, a check still
 * running) stay last either way. As scanned flips the scan order.
 */
export function sortImages(images: ImageResult[], sort: GridSort, direction: SortDirection = "desc"): ImageResult[] {
  if (sort === "scanned") return direction === "desc" ? images : [...images].reverse();
  // A cluster's rank is its size, so the largest identity leads when descending.
  const clusterSize = new Map<string, number>();
  if (sort === "cluster") for (const image of images) if (image.primary_face_cluster) clusterSize.set(image.primary_face_cluster, (clusterSize.get(image.primary_face_cluster) ?? 0) + 1);
  return images
    .map((image, index) => ({ image, index }))
    .sort((left, right) => {
      const a = left.image;
      const b = right.image;
      let by: number;
      switch (sort) {
        case "filename":
          by = FILENAME.compare(fileName(a.rel_path), fileName(b.rel_path)) || FILENAME.compare(a.rel_path, b.rel_path);
          if (direction === "desc") by = -by;
          break;
        case "quality":
          by = compareScore(a.score, b.score, direction);
          break;
        case "nsfw":
          by = compareScore(a.nsfw?.exposed_score, b.nsfw?.exposed_score, direction);
          break;
        case "policy":
          by = comparePolicy(a, b, direction);
          break;
        case "pose":
          // Ascending runs frontal, three-quarter, profile; a frame with no face stays last.
          by = compareScore(poseRank(a), poseRank(b), direction);
          break;
        case "cluster":
          by =
            compareScore(clusterSize.get(a.primary_face_cluster ?? ""), clusterSize.get(b.primary_face_cluster ?? ""), direction) ||
            FILENAME.compare(a.primary_face_cluster ?? "", b.primary_face_cluster ?? "");
          break;
        default:
          by = compareScore(youngestAge(a), youngestAge(b), direction);
      }
      return by || left.index - right.index;
    })
    .map((row) => row.image);
}

const FILENAME = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function fileName(relPath: string): string {
  return relPath.split("/").pop() || relPath;
}

const POSE_ORDER = ["frontal", "three_quarter", "profile"];

function poseRank(image: ImageResult): number | null {
  const rank = image.primary_face_pose ? POSE_ORDER.indexOf(image.primary_face_pose) : -1;
  return rank < 0 ? null : rank;
}

/** Drop hard rejects (failed blur, size or aspect) from the grid. The keep set is unchanged. */
export function filterByPassed(images: ImageResult[], hideRejected: boolean): ImageResult[] {
  return hideRejected ? images.filter((image) => image.passed) : images;
}

function compareScore(left: number | null | undefined, right: number | null | undefined, direction: SortDirection): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const descending = right - left;
  return direction === "desc" ? descending : -descending;
}

function comparePolicy(left: ImageResult, right: ImageResult, direction: SortDirection): number {
  const rank = (image: ImageResult) => {
    const unsafe = effectiveUnsafe(image);
    return unsafe == null ? null : unsafe ? 1 : 0;
  };
  return compareScore(rank(left), rank(right), direction);
}

/** Folder path relative to the source root, plus the label the list shows. */
export function folderLabel(folder: string, root: string | null): { rel: string; label: string } {
  const base = root ? root.replace(/\/$/, "") : "";
  let rel = folder;
  if (base && (folder === base || folder.startsWith(`${base}/`))) {
    rel = folder === base ? "" : folder.slice(base.length + 1);
  }
  const label = rel.split("/").filter(Boolean).pop() || "source root";
  return { rel, label };
}
