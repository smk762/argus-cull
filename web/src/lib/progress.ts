import type { Progress } from "./types";

const PHASES: Record<string, string> = {
  starting: "Starting",
  collecting: "Reading the folder",
  scoring: "Scoring images",
  faces: "Estimating age",
  identities: "Grouping faces",
  prefilter: "Dropping before the slow checks",
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

/** The order the curator runs its phases in. Faces and NudeNet overlap on 0.5.1; `pending_checks` covers that. */
const ORDER = ["starting", "collecting", "scoring", "faces", "identities", "prefilter", "scenes", "garments", "nsfw", "guard", "clustering"];

export type CheckStage = "running" | "queued" | "waiting";

/**
 * Where a live scan is with a check, read off its phases: running when a phase
 * for it is on the bar unfinished or the curator lists it as pending, queued
 * while every phase on the bar comes before it, and otherwise waiting for the
 * scan to finish, since the scan's record of what it ran only lands at the end.
 */
export function checkStage(checks: readonly string[], phases: readonly Progress[], pending: readonly string[]): CheckStage {
  const unfinished = (entry: Progress) => !(entry.total > 0 && entry.done >= entry.total);
  if (checks.some((check) => pending.includes(check) || phases.some((entry) => entry.phase === check && unfinished(entry)))) return "running";
  const first = Math.min(...checks.map((check) => ORDER.indexOf(check)).filter((rank) => rank >= 0));
  const reached = phases.map((entry) => ORDER.indexOf(entry.phase));
  if (reached.length === 0 || reached.every((rank) => rank >= 0 && rank < first)) return "queued";
  return "waiting";
}

export function checkStageNote(stage: CheckStage): string {
  if (stage === "running") return "Running now in this scan. Filters open when the scan finishes.";
  if (stage === "queued") return "Queued in this scan. Filters open when the scan finishes.";
  return "Waiting for this scan to finish.";
}
