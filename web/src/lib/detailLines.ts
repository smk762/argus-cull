import { nudeNetLabel } from "./moderation";
import { EXPOSED_LABELS, slugLabel, type ImageResult, type NsfwResult, type SceneLabel } from "./types";

/**
 * One line each for the folded sections of the detail view, so a reader sees
 * the number and the one or two words that explain it without opening the fold.
 */

/** "0.812 · sharpness 350" or, for a reject, "0.000 · blur" naming the reason. */
export function qualityLine(image: Pick<ImageResult, "score" | "reject_reason" | "sharpness">): string {
  const score = image.score.toFixed(3);
  if (image.reject_reason) return `${score} · ${image.reject_reason}`;
  return `${score} · sharpness ${Math.round(image.sharpness)}`;
}

/** The exposed score, then the exposed classes that scored, highest first: "0.84 · breast 0.84, buttocks 0.31". */
export function nudeNetLine(nsfw: Pick<NsfwResult, "exposed_score" | "labels">): string {
  const exposed = EXPOSED_LABELS.filter((label) => nsfw.labels[label] != null)
    .sort((left, right) => nsfw.labels[right] - nsfw.labels[left])
    .map((label) => `${nudeNetLabel(label)} ${nsfw.labels[label].toFixed(2)}`);
  return exposed.length > 0 ? `${nsfw.exposed_score.toFixed(2)} · ${exposed.join(", ")}` : `${nsfw.exposed_score.toFixed(2)} · nothing exposed at 0.2`;
}

/** The top scene and the environment: "bedroom 0.61 · indoor". */
export function sceneLine(categories: readonly SceneLabel[], environment: string): string {
  const top = [...categories].sort((left, right) => right.conf - left.conf)[0];
  return top ? `${top.label} ${top.conf.toFixed(2)} · ${environment}` : environment;
}

/** The first few labels by confidence, then how many more: "dress 0.82, shoe 0.71 +3". */
export function confLine(rows: readonly { label: string; conf: number }[], shown = 3): string {
  const sorted = [...rows].sort((left, right) => right.conf - left.conf);
  const head = sorted.slice(0, shown).map((row) => `${slugLabel(row.label)} ${row.conf.toFixed(2)}`);
  const more = sorted.length - head.length;
  return more > 0 ? `${head.join(", ")} +${more}` : head.join(", ");
}
