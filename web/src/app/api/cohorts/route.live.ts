import { readFile } from "node:fs/promises";
import path from "node:path";

import { EMPTY_COHORTS, parseCohortConfig, type CohortConfig } from "@/lib/cohorts";

export const dynamic = "force-dynamic";

/** Inside the container compose mounts the repo's cohorts.json here. `npm run dev` from web/ finds the repo copy. */
const CANDIDATES = [process.env.CULL_COHORTS_FILE || "/config/cohorts.json", path.resolve(process.cwd(), "..", "cohorts.json")];

export interface CohortsResponse extends CohortConfig {
  /** Where the rules were read from, or null with `error` set when no file could be read. */
  source: string | null;
  error: string | null;
}

/** The cohort rules, re-read on every call so an edit shows on the next page load. */
export async function GET(): Promise<Response> {
  let lastError: string | null = null;
  for (const file of CANDIDATES) {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") continue;
      lastError = `${file}: ${err instanceof Error ? err.message : "could not read"}`;
      continue;
    }
    try {
      const config = parseCohortConfig(JSON.parse(text));
      return Response.json({ ...config, source: file, error: null } satisfies CohortsResponse);
    } catch (err: unknown) {
      // A broken file is reported, not skipped, so the edit that broke it is easy to find.
      return Response.json({ ...EMPTY_COHORTS, source: file, error: `${file}: ${err instanceof Error ? err.message : "invalid"}` } satisfies CohortsResponse);
    }
  }
  return Response.json({ ...EMPTY_COHORTS, source: null, error: lastError ?? `No cohorts file at ${CANDIDATES.join(" or ")}.` } satisfies CohortsResponse);
}
