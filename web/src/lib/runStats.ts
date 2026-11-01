import { bodyAges, DEFAULT_BLUR, isMinorExposed, measuredAges, mivoloAges, MINOR_AGE_YEARS, revealHeld, shouldBlur, usesSetAge, youngestAge, type BlurPolicy } from "./chunks";
import { bandOf, cohortStats, type Band, type CohortConfig } from "./cohorts";
import type { ImageLabel } from "./labels";
import { ratingCounts } from "./moderation";
import { dissentingPolicies, effectiveUnsafe, policyStats, rate, resolvedGuard, shieldState, verdictConflict } from "./policies";
import { facetCounts } from "./select";
import type { ContentRating, GuardResult, ImageResult, ScanSummary, SelectRequest, SelectResult } from "./types";

/** What produced the numbers, from outside the scan record: versions, the keep-set filters, and the blur settings. */
export interface RunContext {
  curatorVersion?: string | null;
  cullVersion?: string | null;
  /** The request the keep set was selected with, as sent to the curator. */
  filters?: SelectRequest | null;
  blur?: BlurPolicy;
  /** Names given to face clusters on this page. */
  faceNames?: Record<string, string>;
  /** Policies switched off in the sidebar; the summary passed in has already left them out. */
  policiesOff?: readonly string[];
}

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
  versions: { curator: string | null; cull: string | null };
  /** Policies the scan ran but this file leaves out (switched off in the sidebar). Every other section counts without them. */
  policies_off: string[];
  /** The keep-set filters behind `images.kept` and `left_out_reasons`; null before the keep set is calculated. */
  filters: SelectRequest | null;
  /** The grid's blur settings: the NudeNet score that blurs, and whether an unsafe verdict re-blurs. */
  display: { blur_exposed_score: number; policy_blur: boolean };
  config: {
    faces: boolean;
    fairface: boolean;
    mivolo: boolean;
    set_age: boolean;
    /** MiVOLO also read each person's body (`faces.mivolo_body`). */
    mivolo_body: boolean;
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
    /** Frames with no aged face whose age MiVOLO read from a body alone. */
    frames_with_body_age_only: number;
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
    /** Under 18 but not delete-only: an exposed reading under 0.2, or no NudeNet reading yet. Unblur NSFW does not reveal them. */
    frames_under_18_not_exposed: number;
    /** Youngest age from 16 up to (not including) 18, where a MiVOLO misread most often holds a blur. */
    frames_16_to_18: number;
    /** Where each aged frame's youngest age came from. */
    youngest_from: { face: number; body: number; set: number };
    /** How the body check went (`people_check`), on scans that asked for it. */
    people_check: Record<string, number>;
    set_age: ScanSummary["set_age"] | null;
    set_age_skipped: string | null;
  };
  nudenet: {
    scored: number;
    mean_exposed: number | null;
    bands: Record<Band, number>;
    /** Where the exposed reading came from: NudeNet, EraX filling a NudeNet blank, or EraX alone after NudeNet failed. */
    source: { nudenet: number; erax_filled: number; erax_only: number; unscored: number };
    /** Delete-only (under-18 exposed) frames whose exposure rests on EraX alone. */
    minor_exposed_on_erax_only: number;
    content_rating: Record<ContentRating, number>;
  };
  policies: {
    policy: string;
    official: boolean;
    checked: number;
    unsafe: number;
    flag_rate: string;
    rules: Record<string, number>;
    agreement: { both: number; only_official: number; only_this: number; neither: number } | null;
    /** Images this policy has no verdict on: its check failed or never ran for them. */
    unchecked: number;
    /** Fast-screen flags the slower reasoning turned safe (cascade), counted as safe above. */
    slow_overrode_fast: number;
    /** Of those, verdicts recorded unsafe whose only rule is "Safe". */
    rules_only_safe: number;
    labelled: number;
    precision: string | null;
    recall: string | null;
    tp: number;
    fp: number;
    fn: number;
    tn: number;
  }[];
  /** Across every policy: the combined verdict the grid's Verdict picker uses, and official-safe frames a variant flagged. */
  verdicts: { unsafe: number; split: number; safe: number; none: number; official_safe_variant_flagged: number };
  /** What the scan holds: scene, garment, pose and identity counts at the filters' confidence. */
  content: {
    scene_min_conf: number;
    scenes: Record<string, number>;
    environments: Record<string, number>;
    garment_min_conf: number;
    garments: Record<string, number>;
    head_poses: Record<string, number>;
    face_clusters: { cluster_id: string; name: string | null; size: number }[];
  };
  labels: { labelled: number; by_expect: Record<string, number>; overrides: number; tagged_by_hand: number };
  /** Frames the grid blurs under `display`, by the first reason that holds, and what Unblur NSFW still leaves blurred. */
  blur: {
    blurred: number;
    reasons: { held_minor_or_pending: number; nudenet_score: number; erax_only: number; policy: number };
    with_unblur: number;
  };
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
  context: RunContext = {},
): RunStats {
  const images = summary.results;
  const rows = selection && selection.scan_id === summary.scan_id ? selection.rows : null;

  const faceAges: number[] = [];
  let withFaceAge = 0;
  let withBodyOnly = 0;
  let withSetAge = 0;
  let withoutAge = 0;
  let withoutFace = 0;
  let under18 = 0;
  let minorExposed = 0;
  let nearAdult = 0;
  const youngestFrom = { face: 0, body: 0, set: 0 };
  for (const image of images) {
    const youngest = youngestAge(image);
    if (youngest != null) {
      if (youngest >= 16 && youngest < MINOR_AGE_YEARS) nearAdult += 1;
      if (usesSetAge(image)) youngestFrom.set += 1;
      else if (bodyAges(image).some((age) => age === youngest) && !measuredAges(image).some((age) => age === youngest)) youngestFrom.body += 1;
      else youngestFrom.face += 1;
    }
    if (image.face_count === 0) withoutFace += 1;
    const ages = mivoloAges(image);
    if (ages.length === 0) withoutAge += 1;
    else if (usesSetAge(image)) withSetAge += 1;
    else if (measuredAges(image).length > 0) {
      withFaceAge += 1;
      faceAges.push(...measuredAges(image));
    } else withBodyOnly += 1;
    if (ages.some((age) => age < MINOR_AGE_YEARS)) under18 += 1;
    if (isMinorExposed(image)) minorExposed += 1;
  }

  const scored = images.filter((image) => image.nsfw != null);
  const bands: Record<Band, number> = { low: 0, mid: 0, high: 0, unscored: 0 };
  for (const image of images) bands[bandOf(image)] += 1;

  const source = { nudenet: 0, erax_filled: 0, erax_only: 0, unscored: 0 };
  let minorOnErax = 0;
  for (const image of images) {
    if (image.nsfw == null) source.unscored += 1;
    else if (image.nudenet_failed) {
      source.erax_only += 1;
      if (isMinorExposed(image)) minorOnErax += 1;
    } else if (image.erax_filled) source.erax_filled += 1;
    else source.nudenet += 1;
  }

  const override = (rel: string) => labels.get(rel)?.override ?? null;
  const verdicts = { unsafe: 0, split: 0, safe: 0, none: 0, official_safe_variant_flagged: 0 };
  for (const image of images) {
    const state = shieldState(image, override(image.rel_path));
    if (state === "none") verdicts.none += 1;
    else if (state === "safe") verdicts.safe += 1;
    else if (state === "unsafe") verdicts.unsafe += 1;
    else verdicts.split += 1;
    if (dissentingPolicies(image).length > 0) verdicts.official_safe_variant_flagged += 1;
  }
  const cascade = cascadeCounts(images);

  const blur = context.blur ?? DEFAULT_BLUR;
  const blurReasons = { held_minor_or_pending: 0, nudenet_score: 0, erax_only: 0, policy: 0 };
  let blurred = 0;
  let withUnblur = 0;
  for (const image of images) {
    const policyOverride = override(image.rel_path);
    if (shouldBlur(image, [], { ...blur, unblurNsfw: true }, policyOverride)) withUnblur += 1;
    if (!shouldBlur(image, [], { ...blur, unblurNsfw: false }, policyOverride)) continue;
    blurred += 1;
    // The same order shouldBlur tests in, so each blurred frame has one reason.
    if (revealHeld(image, [])) blurReasons.held_minor_or_pending += 1;
    else if ((image.nsfw?.exposed_score ?? -1) >= blur.exposedScore) blurReasons.nudenet_score += 1;
    else if (image.nudenet_failed && image.nsfw != null) blurReasons.erax_only += 1;
    else if (effectiveUnsafe(image, policyOverride) === true) blurReasons.policy += 1;
  }

  const sceneConf = context.filters?.min_scene_conf ?? 0;
  const garmentConf = context.filters?.min_garment_conf ?? summary.garments_config.min_conf ?? 0;
  const facets = facetCounts(images, sceneConf, garmentConf);
  // Labels follow the folder, so only the ones on images still in this scan count.
  const labelList = images.map((image) => labels.get(image.rel_path)).filter((label): label is ImageLabel => label != null);

  // The curator records a policy name even on a scan that did not run SingGuard; it only means something when the check ran.
  const guard = summary.guard_config?.enabled === true ? summary.guard_config : null;
  return {
    generated_at: now.toISOString(),
    scan_id: summary.scan_id,
    folder: summary.folder,
    versions: { curator: context.curatorVersion ?? null, cull: context.cullVersion ?? null },
    policies_off: [...(context.policiesOff ?? [])],
    filters: rows ? (context.filters ?? null) : null,
    display: { blur_exposed_score: blur.exposedScore, policy_blur: blur.policyBlur },
    config: {
      faces: summary.faces_config.enabled,
      fairface: summary.faces_config.fairface,
      mivolo: summary.faces_config.mivolo,
      set_age: summary.faces_config.set_age === true,
      mivolo_body: summary.faces_config.mivolo_body === true,
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
      frames_with_body_age_only: withBodyOnly,
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
      frames_under_18_not_exposed: under18 - minorExposed,
      frames_16_to_18: nearAdult,
      youngest_from: youngestFrom,
      people_check: count(images.filter((image) => image.people_check != null).map((image) => image.people_check as string)),
      set_age: summary.set_age ?? null,
      set_age_skipped: summary.set_age_skipped ?? null,
    },
    nudenet: {
      scored: scored.length,
      mean_exposed: scored.length > 0 ? Math.round((scored.reduce((sum, image) => sum + (image.nsfw?.exposed_score ?? 0), 0) / scored.length) * 1000) / 1000 : null,
      bands,
      source,
      minor_exposed_on_erax_only: minorOnErax,
      content_rating: ratingCounts(images),
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
        unchecked: images.length - entry.checked,
        slow_overrode_fast: cascade.get(entry.policy)?.overrode ?? 0,
        rules_only_safe: cascade.get(entry.policy)?.rulesOnlySafe ?? 0,
        labelled: entry.labelled,
        precision: entry.labelled > 0 ? rate(entry.tp, entry.tp + entry.fp) : null,
        recall: entry.labelled > 0 ? rate(entry.tp, entry.tp + entry.fn) : null,
        tp: entry.tp,
        fp: entry.fp,
        fn: entry.fn,
        tn: entry.tn,
      })),
    verdicts,
    content: {
      scene_min_conf: sceneConf,
      scenes: byCount(facets.scenes),
      environments: byCount(facets.environments),
      garment_min_conf: garmentConf,
      garments: byCount(facets.garments),
      head_poses: count(images.filter((image) => image.primary_face_pose != null).map((image) => image.primary_face_pose as string)),
      face_clusters: summary.face_clusters
        .map((cluster) => ({ cluster_id: cluster.cluster_id, name: context.faceNames?.[cluster.cluster_id] ?? null, size: cluster.size }))
        .sort((left, right) => right.size - left.size),
    },
    labels: {
      labelled: labelList.filter((label) => label.expect != null).length,
      by_expect: count(labelList.filter((label) => label.expect != null).map((label) => label.expect as string)),
      overrides: labelList.filter((label) => label.override).length,
      tagged_by_hand: labelList.filter((label) => (label.tags?.length ?? 0) > 0).length,
    },
    blur: { blurred, reasons: blurReasons, with_unblur: withUnblur },
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

/** A count map as an object, largest first, so the file reads top-down. */
function byCount(map: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries([...map].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

/** Per policy: recorded flags the slower reasoning turned safe, and of those, verdicts whose only rule is "Safe". */
function cascadeCounts(images: readonly ImageResult[]): Map<string, { overrode: number; rulesOnlySafe: number }> {
  const out = new Map<string, { overrode: number; rulesOnlySafe: number }>();
  const tally = (policy: string, guard: GuardResult) => {
    if (guard.safe || !resolvedGuard(guard).safe) return;
    const entry = out.get(policy) ?? { overrode: 0, rulesOnlySafe: 0 };
    entry.overrode += 1;
    if (verdictConflict(guard)) entry.rulesOnlySafe += 1;
    out.set(policy, entry);
  };
  for (const image of images) {
    const official = image.guard?.policy ?? null;
    if (image.guard) tally(official ?? "default", image.guard);
    for (const [policy, guard] of Object.entries(image.guard_variants ?? {})) if (guard && policy !== official) tally(policy, guard);
  }
  return out;
}

function bandCell(band: { tagged: { checked: number; unsafe: number }; rest: { checked: number; unsafe: number } }) {
  return { tagged_checked: band.tagged.checked, tagged_unsafe: band.tagged.unsafe, rest_checked: band.rest.checked, rest_unsafe: band.rest.unsafe };
}

/**
 * `run-stats-<folder>-<scan>.json`, with the folder's last segment so two files from two sets tell apart in a
 * download folder, and `-without-<policies>` when some were switched off, so several files from one run do too.
 */
export function runStatsFilename(summary: Pick<ScanSummary, "scan_id" | "folder">, policiesOff: readonly string[] = []): string {
  const leaf = summary.folder.split("/").filter(Boolean).pop() ?? "root";
  const safe = leaf.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 40) || "root";
  const without = policiesOff.length > 0 ? `-without-${[...policiesOff].sort().join("+").replace(/[^a-z0-9._+-]+/gi, "_").slice(0, 60)}` : "";
  return `run-stats-${safe}-${summary.scan_id.slice(0, 8)}${without}.json`;
}
