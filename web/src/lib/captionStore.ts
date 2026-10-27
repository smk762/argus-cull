import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Caption } from "./cohorts";

/**
 * Captions come from argus-lens sidecars written next to the image: the
 * caption in `<image>.txt`, and in `<image>.xmp` the tags as `dc:subject`
 * keywords and the final caption as `dc:description`. The page reads them from
 * the same source folder the curator scans, mounted read-only at
 * `CULL_SOURCE_DIR`.
 */
const MAX_SIDECAR_BYTES = 64 * 1024;

/** The image path with the source root resolved, or null when it points outside the root. */
export function insideRoot(root: string, imagePath: string): string | null {
  if (imagePath.includes("\0")) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, imagePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) return null;
  return resolved;
}

function stem(imagePath: string): string {
  const parsed = path.parse(imagePath);
  return path.join(parsed.dir, parsed.name);
}

async function readSmall(file: string): Promise<string | null> {
  try {
    const text = await readFile(file, "utf8");
    return text.length > MAX_SIDECAR_BYTES ? text.slice(0, MAX_SIDECAR_BYTES) : text;
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err.code === "ENOENT" || err.code === "ENOTDIR" || err.code === "EISDIR")) return null;
    throw err;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

/** Keywords and description from an XMP sidecar. A sidecar that is not XMP yields nothing. */
export function parseXmp(xml: string): { keywords: string[]; description: string } {
  const keywords: string[] = [];
  const subject = /<dc:subject>([\s\S]*?)<\/dc:subject>/i.exec(xml);
  if (subject) {
    for (const item of subject[1].matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi)) {
      const word = decodeEntities(item[1]).trim();
      if (word) keywords.push(word);
    }
  }
  let description = "";
  const desc = /<dc:description>([\s\S]*?)<\/dc:description>/i.exec(xml);
  if (desc) {
    const first = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i.exec(desc[1]);
    description = decodeEntities((first ? first[1] : desc[1]).replace(/<[^>]+>/g, "")).trim();
  }
  return { keywords, description };
}

/** The caption sidecars for one image, or null when there is none. */
export async function readCaption(root: string, imagePath: string): Promise<Caption | null> {
  const resolved = insideRoot(root, imagePath);
  if (!resolved) return null;
  const base = stem(resolved);
  const [txt, xmp] = await Promise.all([readSmall(`${base}.txt`), readSmall(`${base}.xmp`)]);
  if (txt == null && xmp == null) return null;
  const parsed = xmp == null ? { keywords: [], description: "" } : parseXmp(xmp);
  const text = [txt?.trim() ?? "", parsed.description].filter(Boolean).join("\n");
  return { text, keywords: parsed.keywords };
}
