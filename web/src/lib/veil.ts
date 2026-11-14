/**
 * The veil: what a frame shows while it is blurred, and why, in plain words.
 *
 * A veiled frame is a mosaic, the image averaged down to a few dozen cells on
 * its long side and scaled up square-edged, like frosted glass: composition
 * and colour read, faces and bodies do not. The static demo serves the mosaic
 * as a tiny file from the tape (veils/<id>-<strength>.webp), so a veiled frame
 * never loads its thumbnail or full view; the live page builds the same mosaic
 * in a canvas from the curator's thumbnail and never puts that thumbnail on screen.
 *
 * Two strengths: `medium` for a frame held before or while its safety checks
 * run (rejected, still scanning), so the viewer can see what was set aside;
 * `coarse` for a frame a check flagged (policy, NudeNet, an under-18 reading).
 */
import { isMinorExposed, revealHeld, shouldBlur, youngestAge, DEFAULT_BLUR, MINOR_AGE_YEARS, MINOR_EXPOSED_SCORE, type BlurPolicy } from "./chunks";
import { policyVerdicts } from "./policies";
import { EXPOSED_LABELS, type ImageResult } from "./types";
import { nudeNetLabel, ruleLabelUnder } from "./moderation";

export type VeilStrength = "medium" | "coarse";

/** Cells across the long side. scripts/record_tape.py VEIL_CELLS bakes the same numbers into the tape. */
export const VEIL_CELLS: Record<VeilStrength, number> = { medium: 28, coarse: 16 };

/**
 * Why a frame is veiled. `held`: rejected before the safety checks, so nothing
 * cleared it. `scanning`: a check it needs has not reported. `minor`: an
 * under-18 reading with exposure. `nudenet` and `policy`: a check flagged it,
 * and the viewer may unblur.
 */
export type VeilKind = "held" | "scanning" | "minor" | "nudenet" | "policy";

export interface Veil {
  kind: VeilKind;
  strength: VeilStrength;
  /** The grid chip: Held, Veiled: policy, Veiled: NudeNet. Null while the tile already says Scanning…. */
  chip: string | null;
  /** The detail view's first line, e.g. "Held: not safety-checked". */
  headline: string;
  /** The second line: what happened and what it means. */
  detail: string;
  /** The viewer may unblur it. Never for held, scanning or under-18 frames. */
  unblur: boolean;
}

type Veiled = Parameters<typeof shouldBlur>[0] & Pick<ImageResult, "reject_reason" | "guard" | "guard_variants" | "nsfw" | "nudenet_failed">;

/** The veil on a frame, or null when it shows. Follows `shouldBlur` exactly: this only says why. */
export function veilFor(image: Veiled, pending: readonly string[], blur: BlurPolicy = DEFAULT_BLUR, override: string | null = null): Veil | null {
  if (!shouldBlur(image, pending, blur, override)) return null;
  // A held frame that already reads young or exposed gets the coarse veil: the medium one is for frames nothing has flagged.
  const coarseHeld = (youngestAge(image) ?? Infinity) < MINOR_AGE_YEARS || (image.nsfw?.exposed_score ?? 0) >= MINOR_EXPOSED_SCORE;
  if (isMinorExposed(image)) {
    return {
      kind: "minor",
      strength: "coarse",
      chip: "Held",
      headline: "Held: under 18 with exposure",
      detail: "MiVOLO reads a face as under 18 and NudeNet reported an exposed score of at least 0.2. It is never shown or kept.",
      unblur: false,
    };
  }
  if (image.passed === false) {
    const words = rejectWords(image.reject_reason ?? "");
    return { kind: "held", strength: coarseHeld ? "coarse" : "medium", chip: "Held", headline: words.headline, detail: words.detail, unblur: false };
  }
  if (revealHeld(image, pending)) {
    const nudeDone = image.nsfw != null;
    return {
      kind: "scanning",
      strength: coarseHeld ? "coarse" : "medium",
      chip: null,
      headline: nudeDone ? "Held: waiting for the age check" : "Held: still scanning",
      detail: nudeDone
        ? "NudeNet read some exposure and the age check has not reported, so it could still be an under-18 frame. Unchecked frames are never shown."
        : "The nudity and age checks have not reported yet. Unchecked frames are never shown.",
      unblur: false,
    };
  }
  const score = image.nsfw?.exposed_score;
  if (score != null && score >= blur.exposedScore) {
    return {
      kind: "nudenet",
      strength: "coarse",
      chip: "Veiled: NudeNet",
      headline: "Veiled: NudeNet",
      detail: `NudeNet: ${topExposed(image.nsfw) ?? "exposed"} ${score.toFixed(2)}. Frames at ${blur.exposedScore.toFixed(2)} or more stay veiled until you unblur.`,
      unblur: true,
    };
  }
  if (image.nudenet_failed && image.nsfw != null) {
    return {
      kind: "nudenet",
      strength: "coarse",
      chip: "Veiled: NudeNet",
      headline: "Veiled: NudeNet failed",
      detail: "EraX alone scored this frame, and EraX has no buttocks class, so a low score clears nothing. It stays veiled until you unblur.",
      unblur: true,
    };
  }
  return {
    kind: "policy",
    strength: "coarse",
    chip: "Veiled: policy",
    headline: "Veiled: policy",
    detail: `${policyLine(image, override)}. Frames a policy flags stay veiled until you unblur.`,
    unblur: true,
  };
}

/** The exposed class that set the score, in words: "female breast exposed". */
function topExposed(nsfw: ImageResult["nsfw"]): string | null {
  if (!nsfw) return null;
  let best: string | null = null;
  for (const label of EXPOSED_LABELS) {
    const score = nsfw.labels[label];
    if (score != null && (best == null || score > (nsfw.labels[best as (typeof EXPOSED_LABELS)[number]] ?? 0))) best = label;
  }
  return best ? nudeNetLabel(best) : null;
}

/** "adult flagged rule B (Real-World Crimes & Public Safety)", naming the first policy that flagged, official first. */
export function policyLine(image: Pick<ImageResult, "guard" | "guard_variants">, override: string | null = null): string {
  const verdicts = policyVerdicts(image);
  const unsafe = verdicts.filter((verdict) => !verdict.result.safe && (!override || verdict.policy === override));
  const first = unsafe[0];
  if (!first) return "A policy flagged it";
  const rule = first.result.rules[0];
  const others = unsafe.length - 1;
  const who = others > 0 ? `${first.policy} and ${others} more polic${others === 1 ? "y" : "ies"}` : `the ${first.policy} policy`;
  if (!rule) return `${capital(who)} flagged it`;
  const letter = rule.trim().slice(0, 1).toUpperCase();
  const named = ruleLabelUnder(letter, first.policy);
  const name = (named.startsWith(`${letter}.`) ? named.slice(2) : rule.replace(/^[A-Z]\.?\s*/, "")).trim();
  return `${capital(who)} flagged rule ${letter}${name ? ` (${name})` : ""}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A reject or keep reason in plain words. `headline` is the detail view's
 * first line; `detail` the second; `short` fits a tooltip.
 */
export function rejectWords(reason: string): { headline: string; detail: string; short: string } {
  const raw = reason.trim();
  const never = "so the curator never ran the nudity or age checks. Unchecked frames are never shown.";
  const held = "Held: not safety-checked";
  const crop = /^crop:(\w+)/.exec(raw);
  if (crop) {
    const kind = crop[1];
    const what =
      kind === "overlay"
        ? "a watermark the edge crop couldn't remove"
        : kind === "unchecked"
        ? "a watermark check that couldn't run"
        : kind === "unreadable"
        ? "a crop box file that couldn't be read"
        : kind === "invalid"
        ? "a crop box that doesn't fit the frame"
        : "a crop that couldn't be applied";
    return { headline: held, detail: `Rejected for ${what} (crop:${kind}), ${never}`, short: `${capital(what)} (crop:${kind})` };
  }
  const blurry = /^blurry \(sharpness=([\d.]+) < ([\d.]+)\)/.exec(raw);
  if (blurry) {
    const what = `blur: sharpness ${blurry[1]}, below the ${blurry[2]} floor`;
    return { headline: held, detail: `Rejected for ${what}, ${never}`, short: `Too blurry (sharpness ${blurry[1]} < ${blurry[2]})` };
  }
  const resolution = /^resolution too low \((\d+)px short side\)/.exec(raw);
  if (resolution) {
    const what = `low resolution: ${resolution[1]} px on the short side`;
    return { headline: held, detail: `Rejected for ${what}, ${never}`, short: `Too small (${resolution[1]} px short side)` };
  }
  const aspect = /^aspect ratio ([\d.]+) > ([\d.]+)/.exec(raw);
  if (aspect) {
    const what = `its shape: an aspect ratio of ${aspect[1]}, over the ${aspect[2]} limit`;
    return { headline: held, detail: `Rejected for ${what}, ${never}`, short: `Too wide or tall (aspect ${aspect[1]} > ${aspect[2]})` };
  }
  const prefilter = /^prefilter:([\w-]+)/.exec(raw);
  if (prefilter) {
    const what = prefilter[1] === "nsfw" ? "an exposed reading of 0.2 or more" : prefilter[1] === "no-face" ? "no detected face" : prefilter[1] === "no-age" ? "no age reading" : prefilter[1];
    return {
      headline: "Held: dropped before the slow checks",
      detail: `Dropped for ${what} (prefilter:${prefilter[1]}). A dropped frame is never kept or shown.`,
      short: `Dropped early: ${what}`,
    };
  }
  const similar = /^similar-to:(.+)$/.exec(raw);
  if (similar) {
    const base = similar[1].split("/").pop() || similar[1];
    return { headline: "Left out: duplicate", detail: `A near-duplicate of ${base}; the scan keeps one frame of each group.`, short: `Near-duplicate of ${base}` };
  }
  if (raw === "below-score") return { headline: "Left out: low quality", detail: "Its quality score is under the keep set's minimum.", short: "Quality under the minimum" };
  if (raw === "") return { headline: held, detail: `Rejected, ${never}`, short: "Rejected" };
  return { headline: held, detail: `Rejected (${raw}), ${never}`, short: raw };
}

/**
 * Detected watermark boxes to outline on a veiled crop reject, as fractions of
 * the frame ([x, y, w, h] in 0..1). Boxes are in pixels of the uncropped frame,
 * which is the frame a crop reject shows. Empty for anything else.
 */
export function watermarkBoxes(image: Pick<ImageResult, "reject_reason" | "watermarks" | "width" | "height" | "crop">): [number, number, number, number][] {
  if (!image.reject_reason?.startsWith("crop:") || image.crop || !image.watermarks?.length) return [];
  const { width, height } = image;
  if (!(width > 0 && height > 0)) return [];
  return image.watermarks
    .filter((hit) => hit.bbox.length === 4)
    .map((hit) => {
      const [x, y, w, h] = hit.bbox;
      const left = Math.max(0, Math.min(1, x / width));
      const top = Math.max(0, Math.min(1, y / height));
      return [left, top, Math.max(0, Math.min(1 - left, w / width)), Math.max(0, Math.min(1 - top, h / height))];
    });
}

/**
 * What a frame's <img> (or canvas) shows. A veiled frame never names the
 * thumbnail or the full view as its source: in the static demo it is the
 * tape's veil file, and live it is a mosaic the page draws from the thumbnail
 * without showing it. Only a frame that is not veiled (or that the viewer
 * unblurred, where that is allowed) gets the real rendition.
 */
export type FrameSource = { kind: "veil"; url: string; cells: number } | { kind: "mosaic"; from: string; cells: number } | { kind: "image"; url: string };

export function frameSource(
  veil: Pick<Veil, "strength"> | null,
  urls: { veil: (strength: VeilStrength) => string | null; thumb: string; image: string },
  view: "tile" | "detail",
  cells: Record<VeilStrength, number> = VEIL_CELLS,
): FrameSource {
  if (veil) {
    const url = urls.veil(veil.strength);
    if (url) return { kind: "veil", url, cells: cells[veil.strength] };
    return { kind: "mosaic", from: urls.thumb, cells: cells[veil.strength] };
  }
  return { kind: "image", url: view === "tile" ? urls.thumb : urls.image };
}

/** A tile's reason tooltip: the plain words, then the curator's own reason when they differ. */
export function reasonTitle(reason: string): string {
  const short = rejectWords(reason).short;
  return short === reason.trim() ? reason : `${short}. Curator: ${reason}`;
}
