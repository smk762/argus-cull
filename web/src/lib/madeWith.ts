import type { ScanSummary } from "./types";

/**
 * The "Made with" line for a scan: which curator scored it, and under which
 * SingGuard policy and model. Everything but the curator version comes from
 * what the scan recorded, never from the form or a hard-coded value.
 *
 * Curator does not record its own version on a scan, so the version is the
 * running server's (`/health`), and `versionNote` says so. Nor does it record
 * SingGuard's thinking mode, so the line does not name one.
 */
export interface MadeWith {
  line: string;
  versionNote: string;
}

export function madeWith(
  summary: Pick<ScanSummary, "guard_config" | "results">,
  curatorVersion: string | null | undefined,
): MadeWith {
  const parts = [curatorVersion ? `argus-curator ${curatorVersion}` : "argus-curator"];
  const guard = summary.guard_config;
  if (guard?.enabled !== false && guard?.policy) {
    const variants = guard.variants ?? [];
    parts.push(variants.length > 0 ? `policy ${guard.policy} (+ ${variants.join(", ")})` : `policy ${guard.policy}`);
    const models = [...new Set(summary.results.map((image) => image.guard?.model).filter((model): model is string => Boolean(model)))].sort();
    if (models.length > 0) parts.push(`model ${models.join(", ")}`);
  }
  return {
    line: `Scanned by ${parts.join(" · ")}`,
    versionNote: curatorVersion
      ? "The version is the curator answering now (/health). A scan does not record the version that made it."
      : "The curator did not report a version.",
  };
}
