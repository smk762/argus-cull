import { purgeScanCache } from "@/lib/scanCache";

export const dynamic = "force-dynamic";

const CACHE_DIR = process.env.SCAN_CACHE_DIR || "/scans";

/** Drop cached scans. Called when the folder being scanned changes. */
export async function POST(): Promise<Response> {
  try {
    const removed = await purgeScanCache(CACHE_DIR);
    return Response.json({ removed });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : "Could not purge scans.";
    return Response.json({ detail }, { status: 500 });
  }
}
