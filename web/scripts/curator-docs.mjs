#!/usr/bin/env node
// argus-curator's docs, imported at the commit sync/argus-curator.json records.
//
//   node scripts/curator-docs.mjs --pull [--source <git url or path>]   network: write the docs at the recorded commit
//   node scripts/curator-docs.mjs --check                               offline: the committed copies match the record
//
// The record is the one sync record for curator (scripts/record_fixture.py moves its commit and
// version with the fixture; `make sync-curator` then runs --pull), so the docs, the fixture and
// the curator compose builds are always one commit. Files land in web/content/curator/ (docs) and
// web/public/docs/curator/ (images they reference), each with a sha256 in the record's `docs`,
// which scripts/sync_check.py also checks. web/content/curator/pin.json repeats the record's
// commit and version inside web/, which is all the web image is built from.
//
// Every fetched file goes through the opsec gate (scripts/opsec.mjs) first. It fails closed: a
// hit writes nothing and is fixed in curator, never redacted here.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { denylistFromEnv, opsecHits } from "./opsec.mjs";

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(web);
const recordPath = join(repoRoot, "sync", "argus-curator.json");
const docsDir = join(web, "content", "curator");
const imagesDir = join(web, "public", "docs", "curator");
const pinPath = join(docsDir, "pin.json");

/**
 * The allowlist: curator's README and the docs/ pages Cull links to. Agent and planning files
 * (CLAUDE.md, AGENTS.md, TODO.md) and lab notebooks never go here.
 */
export const DOCS = [
  "README.md",
  "docs/scoring.md",
  "docs/face-attributes.md",
  "docs/scene-tags.md",
  "docs/garments.md",
  "docs/nudity.md",
  "docs/policy-check.md",
  "docs/moderation.md",
  "docs/prefilter.md",
  "docs/crops.md",
  "docs/sidecars.md",
  "docs/xmp.md",
  "docs/manifest.md",
  "docs/http-api.md",
  "docs/cli.md",
  "docs/gpu.md",
];

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const rel = (path) => path.slice(repoRoot.length + 1);
const PIN_FIELDS = ["package", "repo", "branch", "commit", "version"];
const pinOf = (record) => Object.fromEntries(PIN_FIELDS.map((key) => [key, record[key]]));

/** Relative images a doc references, inside the repo; remote ones (badges) are dropped at render, never fetched. */
export function relativeImages(markdown) {
  const found = new Set();
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) found.add(match[1]);
  for (const match of markdown.matchAll(/<img[^>]*\ssrc=["']([^"']+)["']/gi)) found.add(match[1]);
  return [...found]
    .filter((src) => !/^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(src))
    .map((src) => posix.normalize(src.split(/[?#]/)[0]))
    .filter((src) => !src.startsWith("../") && !src.startsWith("/"));
}

function gateOrThrow(label, text) {
  const hits = opsecHits(text, denylistFromEnv());
  if (hits.length === 0) return;
  const lines = hits.map((hit) => `  ${label}:${hit.line}: ${hit.kind}: ${hit.match}`);
  throw new Error(`opsec gate refused ${label}; fix it in curator, nothing is redacted here:\n${lines.join("\n")}`);
}

async function pull(record, source) {
  const work = await mkdtemp(join(tmpdir(), "curator-docs-"));
  try {
    const git = (...args) => execFileSync("git", ["-C", work, ...args], { maxBuffer: 64 << 20 });
    execFileSync("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", "--branch", record.branch, source ?? `https://github.com/${record.repo}.git`, work], { stdio: "inherit" });
    const show = (path) => git("show", `${record.commit}:${path}`);
    // Gate everything first, so a refusal writes nothing.
    const docs = Object.fromEntries(DOCS.map((path) => [path, show(path).toString()]));
    for (const [path, text] of Object.entries(docs)) gateOrThrow(path, text);
    const images = {};
    for (const [path, text] of Object.entries(docs)) {
      for (const src of relativeImages(text)) {
        const at = posix.join(posix.dirname(path), src);
        if (!at.startsWith("../")) images[at] = show(at);
      }
    }

    await rm(docsDir, { recursive: true, force: true });
    await rm(imagesDir, { recursive: true, force: true });
    const hashes = {};
    for (const [dir, files] of [
      [docsDir, docs],
      [imagesDir, images],
    ]) {
      for (const [path, data] of Object.entries(files)) {
        const out = join(dir, path);
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, data);
        hashes[rel(out)] = sha256(data);
      }
    }
    await writeFile(pinPath, `${JSON.stringify(pinOf(record), null, 2)}\n`);
    return Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/** Every disagreement between the committed copies and the sync record. Reads no network. */
export async function check(record) {
  const problems = [];
  const listed = record.docs ?? {};
  const pin = JSON.parse(await readFile(pinPath, "utf8").catch(() => "{}"));
  for (const key of PIN_FIELDS) {
    if (pin[key] !== record[key]) problems.push(`${rel(pinPath)} says ${key} ${pin[key] ?? "(none)"}, the sync record says ${record[key]}; run \`npm run docs:pull\``);
  }
  for (const path of DOCS) {
    if (!(rel(join(docsDir, path)) in listed)) problems.push(`${path} is on the allowlist but not in the sync record; run \`npm run docs:pull\``);
  }
  for (const file of [...(await listFiles(docsDir)), ...(await listFiles(imagesDir))]) {
    if (file === pinPath) continue;
    if (!(rel(file) in listed)) problems.push(`${rel(file)} is not in the sync record`);
    else if (file.endsWith(".md")) {
      for (const hit of opsecHits(await readFile(file, "utf8"), denylistFromEnv())) problems.push(`${rel(file)}:${hit.line}: opsec: ${hit.kind}: ${hit.match}`);
    }
  }
  // Hashes and missing files: scripts/sync_check.py, which make check runs beside this.
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const sourceAt = args.indexOf("--source");
  const source = sourceAt >= 0 ? args[sourceAt + 1] : undefined;
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  if (args.includes("--pull")) {
    record.docs = await pull(record, source);
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`Wrote ${Object.keys(record.docs).length} files from ${record.repo}@${record.commit.slice(0, 9)} (${record.version}).`);
    return;
  }
  if (args.includes("--check")) {
    const problems = await check(record);
    if (problems.length > 0) {
      console.error(`curator docs check failed:\n- ${problems.join("\n- ")}`);
      process.exit(1);
    }
    console.log(`curator docs ok: ${Object.keys(record.docs ?? {}).length} files at ${record.commit.slice(0, 9)}, opsec clean`);
    return;
  }
  console.error("usage: curator-docs.mjs --pull [--source <git url or path>] | --check");
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
