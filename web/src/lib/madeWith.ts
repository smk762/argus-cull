import type { ScanSummary } from "./types";

/**
 * The "Made with" line for a scan: which curator scored it, and under which
 * SingGuard policy, model and thinking mode. Everything but the curator
 * version comes from what the scan recorded, never from the form or a
 * hard-coded value.
 *
 * Curator does not record its own version on a scan, so the version is the
 * running server's (`/health`), and the note says so.
 *
 * The thinking mode: when the scan records the mode it asked for
 * (`guard_config.thinking`, argus-curator#152), that is it. Until then, it is
 * read from the mode each verdict says judged it (`guard.thinking` and every
 * variant's). Fast and slow together is cascade: fast screened every frame and
 * slow judged the ones it flagged. All fast is ambiguous, since a cascade scan
 * that escalated nothing reads the same as one that asked for fast, and the
 * note says so.
 */
export interface MadeWith {
  line: string;
  note: string;
}

type Summary = Pick<ScanSummary, "guard_config" | "results">;

export interface ThinkingRead {
  /** What the line shows after "thinking". */
  text: string;
  /** Set when the recorded data cannot tell the requested mode apart. */
  caveat: string | null;
}

/** The thinking mode as recorded, or null when no verdict names one. */
export function thinkingMode(summary: Summary): ThinkingRead | null {
  const counts = new Map<string, number>();
  for (const image of summary.results) {
    for (const verdict of [image.guard, ...Object.values(image.guard_variants ?? {})]) {
      if (verdict?.thinking) counts.set(verdict.thinking, (counts.get(verdict.thinking) ?? 0) + 1);
    }
  }
  const tally = (modes: string[]) => modes.map((mode) => `${mode} ${counts.get(mode)}`).join(", ");
  const asked = summary.guard_config?.thinking;
  if (asked) return { text: counts.size > 0 && !(counts.size === 1 && counts.has(asked)) ? `${asked} (${tally([...counts.keys()].sort())})` : asked, caveat: null };
  if (counts.size === 0) return null;
  const modes = [...counts.keys()].sort();
  if (modes.length === 2 && modes[0] === "fast" && modes[1] === "slow") return { text: `cascade (${tally(["fast", "slow"])})`, caveat: null };
  if (modes.length === 1 && modes[0] === "fast") {
    return {
      text: "fast",
      caveat: "Every verdict was judged in fast. A cascade scan whose fast screen flagged nothing reads the same, and the scan does not record which mode it asked for.",
    };
  }
  return { text: modes.length === 1 ? modes[0] : tally(modes), caveat: null };
}

export function madeWith(summary: Summary, curatorVersion: string | null | undefined): MadeWith {
  const parts = [curatorVersion ? `argus-curator ${curatorVersion}` : "argus-curator"];
  const notes = [
    curatorVersion ? "The version is the curator answering now (/health). A scan does not record the version that made it." : "The curator did not report a version.",
  ];
  const guard = summary.guard_config;
  if (guard?.enabled !== false && guard?.policy) {
    const variants = guard.variants ?? [];
    parts.push(variants.length > 0 ? `policy ${guard.policy} (+ ${variants.join(", ")})` : `policy ${guard.policy}`);
    const models = [...new Set(summary.results.map((image) => image.guard?.model).filter((model): model is string => Boolean(model)))].sort();
    if (models.length > 0) parts.push(`model ${models.join(", ")}`);
    const thinking = thinkingMode(summary);
    if (thinking) {
      parts.push(`thinking ${thinking.text}`);
      if (thinking.caveat) notes.push(thinking.caveat);
    }
  }
  return { line: `Scanned by ${parts.join(" · ")}`, note: notes.join(" ") };
}
