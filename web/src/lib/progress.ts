import type { Progress } from "./types";

const PHASES: Record<string, string> = {
  starting: "Starting",
  collecting: "Reading the folder",
  scoring: "Scoring images",
  faces: "Estimating age",
  identities: "Grouping faces",
  scenes: "Tagging scenes",
  garments: "Reading garments",
  nsfw: "Checking nudity",
  guard: "Checking policy",
  clustering: "Grouping duplicates",
  transferring: "Writing the export",
};

export function phaseLabel(phase: string): string {
  return PHASES[phase] ?? phase.replaceAll("_", " ");
}

/**
 * Fold a progress event into the phases on the bar. Face detection and NudeNet
 * run at the same time on curator 0.5.1, and their events interleave, so a phase
 * stays on the bar until an event shows it finished and a later event arrives.
 * Phases run one after the other otherwise, so a new phase replaces finished ones.
 */
export function mergeProgress(current: readonly Progress[], event: Progress): Progress[] {
  if (!TOGETHER.has(event.phase)) return [event];
  const rest = current.filter((entry) => TOGETHER.has(entry.phase) && entry.phase !== event.phase && !(entry.total > 0 && entry.done >= entry.total));
  return [...rest, event].sort((left, right) => rankTogether(left.phase) - rankTogether(right.phase));
}

/** Phases the curator runs at the same time. */
const TOGETHER = new Set(["faces", "nsfw"]);

function rankTogether(phase: string): number {
  return phase === "faces" ? 0 : 1;
}

/** Fraction complete, or null when the phase has no total yet. */
export function progressRatio(progress: Progress): number | null {
  if (progress.total <= 0) return null;
  return Math.min(1, Math.max(0, progress.done / progress.total));
}
