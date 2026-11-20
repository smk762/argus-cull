import type { Caption } from "./cohorts";

const BATCH = 400;

/**
 * Ask for the captions of every path not asked about yet, 400 at a time, and
 * hand each batch to *apply* as it lands. A batch is applied even when the page
 * has moved on to more results: captions are keyed by abs_path, so they are
 * never wrong for a later render, and the next call has already left these
 * paths out as asked. A failed batch, and the ones after it, are given back so
 * a later call asks again; the error is then rethrown.
 */
export async function fetchMissingCaptions(
  paths: readonly string[],
  asked: Set<string>,
  get: (batch: string[]) => Promise<Record<string, Caption | null>>,
  apply: (found: Record<string, Caption | null>) => void,
): Promise<void> {
  const missing = paths.filter((abs) => !asked.has(abs));
  if (missing.length === 0) return;
  for (const abs of missing) asked.add(abs);
  const batches: string[][] = [];
  for (let start = 0; start < missing.length; start += BATCH) batches.push(missing.slice(start, start + BATCH));
  for (const [index, batch] of batches.entries()) {
    try {
      apply(await get(batch));
    } catch (err: unknown) {
      for (const rest of batches.slice(index)) for (const abs of rest) asked.delete(abs);
      throw err;
    }
  }
}
