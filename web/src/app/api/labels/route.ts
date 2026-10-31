import { TAG_PATTERN } from "@/lib/cohorts";
import { isExpect, type ImageLabel } from "@/lib/labels";
import { readLabels, writeLabel } from "@/lib/labelStore";

export const dynamic = "force-dynamic";

const LABELS_DIR = process.env.CULL_LABELS_DIR || "/labels";
const MAX_NOTE = 2000;
const MAX_TAGS = 32;

function bad(detail: string, status = 400): Response {
  return Response.json({ detail }, { status });
}

function folderOf(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) return null;
  return value;
}

/** Labels for one scanned folder. `?folder=` is the folder the curator reports on the scan. */
export async function GET(request: Request): Promise<Response> {
  const folder = folderOf(new URL(request.url).searchParams.get("folder"));
  if (!folder) return bad("folder is required");
  try {
    return Response.json(await readLabels(LABELS_DIR, folder));
  } catch (err: unknown) {
    return bad(err instanceof Error ? err.message : "Could not read labels.", 500);
  }
}

/** Set or clear one image's label: `{ folder, rel_path, label }`, label null to clear. */
export async function PUT(request: Request): Promise<Response> {
  let body: { folder?: unknown; rel_path?: unknown; label?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad("body must be JSON");
  }
  const folder = folderOf(body.folder);
  if (!folder) return bad("folder is required");
  if (typeof body.rel_path !== "string" || body.rel_path === "" || body.rel_path.includes("\0")) return bad("rel_path is required");
  let label: Omit<ImageLabel, "updated_at"> | null = null;
  if (body.label != null) {
    if (typeof body.label !== "object") return bad("label must be an object or null");
    const raw = body.label as Record<string, unknown>;
    if (raw.expect != null && !isExpect(raw.expect)) return bad("expect must be hard, ambiguous, adult, other, or safe");
    if (raw.override != null && typeof raw.override !== "string") return bad("override must be a policy name");
    if (raw.note != null && typeof raw.note !== "string") return bad("note must be text");
    if (raw.tags != null && (!Array.isArray(raw.tags) || raw.tags.length > MAX_TAGS || raw.tags.some((tag) => typeof tag !== "string" || !TAG_PATTERN.test(tag)))) {
      return bad(`tags must be a list of up to ${MAX_TAGS} short names`);
    }
    label = {
      expect: isExpect(raw.expect) ? raw.expect : null,
      proxy: raw.proxy === true,
      override: typeof raw.override === "string" && raw.override.trim() ? raw.override.trim() : null,
      note: typeof raw.note === "string" ? raw.note.slice(0, MAX_NOTE) : undefined,
      ...(Array.isArray(raw.tags) ? { tags: [...new Set(raw.tags as string[])] } : {}),
    };
  }
  try {
    return Response.json(await writeLabel(LABELS_DIR, folder, body.rel_path, label));
  } catch (err: unknown) {
    return bad(err instanceof Error ? err.message : "Could not write labels.", 500);
  }
}
