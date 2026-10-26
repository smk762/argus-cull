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

/** Fraction complete, or null when the phase has no total yet. */
export function progressRatio(progress: Progress): number | null {
  if (progress.total <= 0) return null;
  return Math.min(1, Math.max(0, progress.done / progress.total));
}
