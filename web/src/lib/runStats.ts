import { isMinorExposed, measuredAges, mivoloAges, MINOR_AGE_YEARS, usesSetAge } from "./chunks";
import { bandOf, cohortStats, type Band, type CohortConfig } from "./cohorts";
import type { ImageLabel } from "./labels";
import { policyStats, rate } from "./policies";
import type { ScanSummary, SelectResult } from "./types";

/**
 * The numbers of one run, as a file: what the scan ran, how many frames
 * passed and why the rest did not, the ages it read, what NudeNet scored, how
 * each policy judged, and which setting, wardrobe and prop tags moved the
 * flag rate. One file per run, so two runs of the same folder under different
 * parameters can be set side by side.
 */
export interface RunStats {
  generated_at: string;
  scan_id: string;
  folder: string;
  config: {
    faces: boolean;
    fairface: boolean;
    mivolo: boolean;
    set_age: boolean;
    scenes: boolean;
    garments: boolean;
    nsfw: boolean;
    guard: boolean;
    policy: string | null;
    variants: string[];
  };
  images: {
    total: number;
    passed: number;
    rejected: number;
    duplicates: number;
    /** Hard rejects by the curator's reason. */
    reject_reasons: Record<string, number>;
    /** The keep set under the filters on screen, when one has been computed. */
    kept: number | null;
    left_out: number | null;
    /** Reasons the current filters left frames out, by the curator's keep_reason. */
    left_out_reasons: Record<string, number> | null;
  };
  age: {
    /** Frames with a face MiVOLO aged. */
    frames_with_face_age: number;
    /** Frames with no face that took the set's age. */
    frames_with_set_age: number;
    frames_without_age: number;
    frames_without_face: number;
    /** Over every MiVOLO face reading in the scan. */
    faces_measured: number;
    mean_years: number | null;
    median_years: number | null;
    min_years: number | null;
    max_years: number | null;
    /** Frames whose youngest age (measured or set) is under 18. */
    frames_under_18: number;
    /** Frames the under-18 rule holds: a youngest age under 18 with an exposed reading of 0.2 or more. */
    frames_minor_exposed: number;
    set_age: ScanSummary["set_age"] | null;
    set_age_skipped: string | null;
  };
  nudenet: {
    scored: number;
    mean_exposed: number | null;
    bands: Record<Band, number>;
  };
  policies: {
    policy: string;
    official: boolean;
    checked: number;
    unsafe: number;
    flag_rate: string;
    rules: Record<string, number>;
    agreement: { both: number; only_official: number; only_this: number; neither: number } | null;
    labelled: number;
    precision: string | null;
    recall: string | null;
    tp: number;
    fp: number;
    fn: number;
    tn: number;
  }[];
  /** Trigger tags: per tag, how often each policy flagged tagged frames against the rest of the scan. */
  tags: {
    tag: string;
    group: string;
    images: number;
    by_hand: number;
    policies: {
      policy: string;
      tagged_checked: number;
      tagged_unsafe: number;
      tagged_flag_rate: string;
      rest_checked: number;
      rest_unsafe: number;
      rest_flag_rate: string;
      bands: Record<Band, { tagged_checked: number; tagged_unsafe: number; rest_checked: number; rest_unsafe: number }>;
    }[];
  }[];
}

function count(values: Iterable<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

/** `similar-to:17.jpg` counts as `similar-to`: the reason, not the file it names. */
function reasonKind(reason: string): string {
  const colon = reason.indexOf(":");
  return colon > 0 ? reason.slice(0, colon) : reason;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function runStats(
  summary: ScanSummary,
  selection: SelectResult | null,
  labels: ReadonlyMap<string, ImageLabel>,
  tags: ReadonlyMap<string, readonly string[]>,
  cohorts: CohortConfig,
  policyNames: readonly string[],
  now: Date = new Date(),
): RunStats {
  const images = summary.results;
  const rows = selection && selection.scan_id === summary.scan_id ? selection.rows : null;

  const faceAges: number[] = [];
  let withFaceAge = 0;
  let withSetAge = 0;
  let withoutAge = 0;
  let withoutFace = 0;
  let under18 = 0;
  let minorExposed = 0;
  for (const image of images) {
    if (image.face_count === 0) withoutFace += 1;
    const ages = mivoloAges(image);
    if (ages.length === 0) withoutAge += 1;
    else if (usesSetAge(image)) withSetAge += 1;
    else {
      withFaceAge += 1;
      faceAges.push(...measuredAges(image));
    }
    if (ages.some((age) => age < MINOR_AGE_YEARS)) under18 += 1;
    if (isMinorExposed(image)) minorExposed += 1;
  }

  const scored = images.filter((image) => image.nsfw != null);
  const bands: Record<Band, number> = { low: 0, mid: 0, high: 0, unscored: 0 };
  for (const image of images) bands[bandOf(image)] += 1;

  // The curator records a policy name even on a scan that did not run SingGuard; it only means something when the check ran.
  const guard = summary.guard_config?.enabled === true ? summary.guard_config : null;
  return {
    generated_at: now.toISOString(),
    scan_id: summary.scan_id,
    folder: summary.folder,
    config: {
      faces: summary.faces_config.enabled,
      fairface: summary.faces_config.fairface,
      mivolo: summary.faces_config.mivolo,
      set_age: summary.faces_config.set_age === true,
      scenes: summary.scenes_config.enabled,
      garments: summary.garments_config.enabled,
      nsfw: summary.nsfw_config?.enabled === true,
      guard: guard != null,
      policy: guard?.policy ?? null,
      variants: [...(guard?.variants ?? [])],
    },
    images: {
      total: summary.total,
      passed: summary.passed,
      rejected: summary.rejected,
      duplicates: summary.duplicates,
      reject_reasons: count(images.filter((image) => image.reject_reason).map((image) => image.reject_reason as string)),
      kept: rows ? rows.filter((row) => row.keep_reason === "").length : null,
      left_out: rows ? rows.filter((row) => row.keep_reason !== "").length : null,
      left_out_reasons: rows ? count(rows.filter((row) => row.keep_reason !== "").map((row) => reasonKind(row.keep_reason))) : null,
    },
    age: {
      frames_with_face_age: withFaceAge,
      frames_with_set_age: withSetAge,
      frames_without_age: withoutAge,
      frames_without_face: withoutFace,
      faces_measured: faceAges.length,
      mean_years: faceAges.length > 0 ? round(faceAges.reduce((sum, age) => sum + age, 0) / faceAges.length) : null,
      median_years: faceAges.length > 0 ? round(median(faceAges) as number) : null,
      min_years: faceAges.length > 0 ? round(Math.min(...faceAges)) : null,
      max_years: faceAges.length > 0 ? round(Math.max(...faceAges)) : null,
      frames_under_18: under18,
      frames_minor_exposed: minorExposed,
      set_age: summary.set_age ?? null,
      set_age_skipped: summary.set_age_skipped ?? null,
    },
    nudenet: {
      scored: scored.length,
      mean_exposed: scored.length > 0 ? Math.round((scored.reduce((sum, image) => sum + (image.nsfw?.exposed_score ?? 0), 0) / scored.length) * 1000) / 1000 : null,
      bands,
    },
    // A policy that judged nothing (named in the config of a scan that ran without SingGuard) has no rate to report.
    policies: policyStats(images, labels, policyNames)
      .filter((entry) => entry.checked > 0)
      .map((entry) => ({
        policy: entry.policy,
        official: entry.official,
        checked: entry.checked,
        unsafe: entry.unsafe,
        flag_rate: rate(entry.unsafe, entry.checked),
        rules: entry.rules,
        agreement: entry.agreement ? { both: entry.agreement.both, only_official: entry.agreement.onlyOfficial, only_this: entry.agreement.onlyThis, neither: entry.agreement.neither } : null,
        labelled: entry.labelled,
        precision: entry.labelled > 0 ? rate(entry.tp, entry.tp + entry.fp) : null,
        recall: entry.labelled > 0 ? rate(entry.tp, entry.tp + entry.fn) : null,
        tp: entry.tp,
        fp: entry.fp,
        fn: entry.fn,
        tn: entry.tn,
      })),
    tags: cohortStats(images, tags, cohorts, policyNames).map((cohort) => ({
      tag: cohort.tag,
      group: cohort.group,
      images: cohort.images,
      by_hand: images.filter((image) => labels.get(image.rel_path)?.tags?.includes(cohort.tag)).length,
      policies: cohort.policies.map((entry) => ({
        policy: entry.policy,
        tagged_checked: entry.tagged.checked,
        tagged_unsafe: entry.tagged.unsafe,
        tagged_flag_rate: rate(entry.tagged.unsafe, entry.tagged.checked),
        rest_checked: entry.rest.checked,
        rest_unsafe: entry.rest.unsafe,
        rest_flag_rate: rate(entry.rest.unsafe, entry.rest.checked),
        bands: {
          low: bandCell(entry.bands.low),
          mid: bandCell(entry.bands.mid),
          high: bandCell(entry.bands.high),
          unscored: bandCell(entry.bands.unscored),
        },
      })),
    })),
  };
}

function bandCell(band: { tagged: { checked: number; unsafe: number }; rest: { checked: number; unsafe: number } }) {
  return { tagged_checked: band.tagged.checked, tagged_unsafe: band.tagged.unsafe, rest_checked: band.rest.checked, rest_unsafe: band.rest.unsafe };
}

/** `run-stats-<folder>-<scan>.json`, with the folder's last segment so two files from two sets tell apart in a download folder. */
export function runStatsFilename(summary: Pick<ScanSummary, "scan_id" | "folder">): string {
  const leaf = summary.folder.split("/").filter(Boolean).pop() ?? "root";
  const safe = leaf.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 40) || "root";
  return `run-stats-${safe}-${summary.scan_id.slice(0, 8)}.json`;
}
