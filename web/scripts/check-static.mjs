// Post-build check for the static demo (`make pages`): the export is pure static files.
//
//   - no API routes were exported (out/api) and no page fetches /api/ or the curator's port
//   - every page carries the hash-based CSP <meta>, and _headers is there for the host
//   - the tape is in the export, with a file for every image it lists
//
//   node scripts/check-static.mjs [outDir]   (run by `npm run build:pages`)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "out";
const tapeDir = (process.env.NEXT_PUBLIC_CULL_TAPE_URL || "/data-tape").replace(/^\/+|\/+$/g, "");
const problems = [];
const files = readdirSync(out, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));

if (existsSync(join(out, "api"))) problems.push("out/api exists: an API route was exported");
for (const file of files.filter((f) => f.endsWith(".html"))) {
  if (!readFileSync(file, "utf8").includes('http-equiv="Content-Security-Policy"')) problems.push(`${file} has no CSP <meta>`);
}
if (!existsSync(join(out, "_headers"))) problems.push("no _headers file");
// Chunks may still name the live paths as strings; what matters is that the static branch never calls them,
// which src/lib/static.test.ts checks. Here: no page HTML references them.
// The imported curator docs (out/docs/) name the curator's port in their prose ("HTTP API (:8101)"), so
// there only an href or src that points at it counts.
const docsDir = join(out, "docs");
for (const file of files.filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  const port = file.startsWith(docsDir) ? /(?:href|src)="[^"]*:8101/ : /:8101/;
  if (/\/api\/(labels|cohorts|captions|display)/.test(html) || port.test(html)) problems.push(`${file} references the live API`);
}
const tapeJson = join(out, tapeDir, "tape.json");
if (!existsSync(tapeJson)) problems.push(`no tape at ${tapeJson}`);
else {
  const tape = JSON.parse(readFileSync(tapeJson, "utf8"));
  for (const id of Object.values(tape.files)) {
    for (const part of [`thumbs/${id}.webp`, `images/${id}.webp`, `detail/${id}.json`]) {
      if (!existsSync(join(out, tapeDir, part))) problems.push(`tape file missing: ${part}`);
    }
  }
  const doc = tape.provenance?.document;
  if (doc && !existsSync(join(out, tapeDir, doc))) problems.push(`tape file missing: ${doc}`);
}
if (problems.length) {
  console.error(`check-static: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-static: ${files.length} files, pure static, CSP on every page, tape in ${tapeDir}/`);
