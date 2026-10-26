import { EXPOSED_LABELS, RACES, type FaceRace, type ImageResult, type ScanChunk, type ScanSummary } from "./types";

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

export type GridSort = "scanned" | "nsfw" | "policy" | "age" | "race";
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
  guard?: { safe?: boolean; rules?: string[] } | null;
  primary_face_attributes?: AgedFace;
  faces?: { attributes?: AgedFace }[] | null;
};

function mivoloAges(image: AgeChecked): number[] {
  const ages = [mivoloYears(image.primary_face_attributes), ...(image.faces ?? []).map((face) => mivoloYears(face.attributes))];
  return ages.filter((age): age is number => age != null);
}

function hasMinorAge(image: AgeChecked): boolean {
  return mivoloAges(image).some((age) => age < MINOR_AGE_YEARS);
}

/** Any face MiVOLO puts under 18, once an exposed class scores at least 0.2. */
export function isMinorExposed(image: AgeChecked): boolean {
  if (image.nsfw == null) return false;
  const labels = image.nsfw.labels;
  const fromLabels = EXPOSED_LABELS.reduce((max, label) => Math.max(max, labels?.[label] ?? 0), 0);
  const score = Math.max(fromLabels, image.nsfw.exposed_score ?? 0);
  if (score < MINOR_EXPOSED_SCORE) return false;
  return hasMinorAge(image);
}

/** A MiVOLO age under 18 whose NudeNet result has not landed yet. */
export function minorAwaitingNude(image: AgeChecked, pending: readonly string[]): boolean {
  if (!pending.includes("nsfw") || image.nsfw != null) return false;
  return hasMinorAge(image);
}

/**
 * Blur until NudeNet reports. A score under the line lifts it immediately, even
 * while policy is still running. An unsafe policy verdict puts it back, unless
 * that re-blur is opted out. An under-18 face with an exposed score stays blurred.
 * Unblur NSFW reveals other NudeNet and policy blur, and leaves every under-18 face blurred.
 */
export function shouldBlur(image: AgeChecked, pending: readonly string[], blur: BlurPolicy = DEFAULT_BLUR): boolean {
  if (isMinorExposed(image)) return true;
  if (minorAwaitingNude(image, pending)) return true;
  const ageStillComing = pending.includes("faces") && mivoloAges(image).length === 0;
  if (blur.unblurNsfw && !hasMinorAge(image) && !ageStillComing) return false;
  if (pending.includes("nsfw") && image.nsfw == null) return true;
  const score = image.nsfw?.exposed_score;
  if (score != null && score >= blur.exposedScore) return true;
  if (blur.policyBlur && image.guard?.safe === false) return true;
  return false;
}

/** Youngest MiVOLO age on the image, counting every face. FairFace brackets are not years. */
export function youngestAge(image: AgeChecked): number | null {
  const years = mivoloAges(image);
  return years.length > 0 ? Math.min(...years) : null;
}

/** Hide kept or left-out images. An unknown reason, or a missing selection, leaves the list unchanged. */
export function filterByKeep(images: ImageResult[], reasons: ReadonlyMap<string, string> | null, view: KeepView): ImageResult[] {
  if (view === "all" || reasons == null) return images;
  return images.filter((image) => {
    const kept = reasons.get(image.rel_path) === "";
    return view === "kept" ? kept : !kept;
  });
}

/** Hide images whose primary face is not this FairFace race. No selection shows every image. Images with no race drop out once a race is selected. */
export function filterByRace(images: ImageResult[], race: FaceRace | null): ImageResult[] {
  if (race == null) return images;
  return images.filter((image) => image.primary_face_attributes?.race === race);
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
 * Order the gallery. Descending keeps the original meaning: highest NudeNet score,
 * policy issues, and oldest ages first. Race descending follows the FairFace label
 * order from the end. Ascending flips those values. Images still waiting on the
 * value stay last either way. As scanned flips the scan order.
 */
export function sortImages(images: ImageResult[], sort: GridSort, direction: SortDirection = "desc"): ImageResult[] {
  if (sort === "scanned") return direction === "desc" ? images : [...images].reverse();
  return images
    .map((image, index) => ({ image, index }))
    .sort((left, right) => {
      const by =
        sort === "nsfw"
          ? compareScore(left.image.nsfw?.exposed_score, right.image.nsfw?.exposed_score, direction)
          : sort === "policy"
            ? comparePolicy(left.image, right.image, direction)
            : sort === "race"
            ? compareScore(raceRank(left.image), raceRank(right.image), direction)
            : compareScore(youngestAge(left.image), youngestAge(right.image), direction);
      return by || left.index - right.index;
    })
    .map((row) => row.image);
}

function raceRank(image: ImageResult): number | null {
  const race = image.primary_face_attributes?.race;
  if (race == null) return null;
  const index = RACES.indexOf(race);
  return index < 0 ? null : index;
}

function compareScore(left: number | null | undefined, right: number | null | undefined, direction: SortDirection): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const descending = right - left;
  return direction === "desc" ? descending : -descending;
}

function comparePolicy(left: ImageResult, right: ImageResult, direction: SortDirection): number {
  const rank = (image: ImageResult) => (image.guard == null ? null : image.guard.safe ? 0 : 1);
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
