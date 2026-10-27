import { stat } from "node:fs/promises";

import { readCaption } from "@/lib/captionStore";
import type { Caption } from "@/lib/cohorts";

export const dynamic = "force-dynamic";

/** The curator's source root, mounted read-only into this container at the same path. */
const SOURCE_DIR = process.env.CULL_SOURCE_DIR || "/data/images";
const MAX_PATHS = 500;

export interface CaptionsResponse {
  captions: Record<string, Caption | null>;
}

function bad(detail: string, status = 400): Response {
  return Response.json({ detail }, { status });
}

/** Caption sidecars for a batch of image paths (`abs_path` as the curator reports them): `{ paths: [...] }`. */
export async function POST(request: Request): Promise<Response> {
  let body: { paths?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad("body must be JSON");
  }
  if (!Array.isArray(body.paths) || body.paths.some((item) => typeof item !== "string")) return bad("paths must be a list of strings");
  if (body.paths.length > MAX_PATHS) return bad(`at most ${MAX_PATHS} paths per request`);
  try {
    if (!(await stat(SOURCE_DIR)).isDirectory()) throw new Error("not a directory");
  } catch {
    return bad(`The source folder is not mounted at ${SOURCE_DIR}, so captions cannot be read.`, 503);
  }
  const captions: Record<string, Caption | null> = {};
  try {
    await Promise.all(
      (body.paths as string[]).map(async (imagePath) => {
        captions[imagePath] = await readCaption(SOURCE_DIR, imagePath);
      }),
    );
  } catch (err: unknown) {
    return bad(err instanceof Error ? err.message : "Could not read captions.", 500);
  }
  return Response.json({ captions } satisfies CaptionsResponse);
}
