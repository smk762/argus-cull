#!/usr/bin/env node
// Browser regression for the demo sidebar (the static build in web/out):
// every section starts closed; every checkbox in it toggles on click, on Space
// and on its label, and changes the grid; unticking puts the grid back. The
// Display section's All / Kept / Left out switch moves the grid and the URL by
// click and by arrow key, and the toolbar carries no view switch or demo badges.
//
//   make pages && node web/scripts/sidebar-e2e.mjs [web/out | https://preview.example]
//
// Needs Playwright and a Chromium it can launch. It is not a dependency of the
// app: point PLAYWRIGHT_DIR at a folder whose node_modules holds `playwright`
// (and CHROMIUM at a browser binary if Playwright's own is not installed).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, normalize, resolve } from "node:path";

const target = process.argv[2] ?? new URL("../out", import.meta.url).pathname;
const remote = /^https?:\/\//.test(target);
const root = remote ? null : resolve(target);
const require = createRequire(join(resolve(process.env.PLAYWRIGHT_DIR ?? "."), "node_modules/"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("sidebar-e2e: playwright not found; set PLAYWRIGHT_DIR to a folder with node_modules/playwright");
  process.exit(2);
}

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  for (const candidate of [path, `${path}.html`]) {
    try {
      const body = await readFile(join(root, candidate));
      res.writeHead(200, { "content-type": TYPES[extname(candidate)] ?? "application/octet-stream" });
      res.end(body);
      return;
    } catch {
      // next candidate
    }
  }
  res.writeHead(404);
  res.end();
});
if (!remote) await new Promise((done) => server.listen(0, done));
const url = remote ? target : `http://localhost:${server.address().port}/`;

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(url);
await page.waitForSelector("ul.grid > li");
await page.waitForFunction(() => !document.body.innerText.includes("Replaying…") && !document.body.innerText.includes("Selecting…"), null, { timeout: 60_000 });

// What the grid shows: the count line, then each tile's chip, frame and every tooltip on it (name, shields, chip).
const grid = () =>
  page.evaluate(() => {
    const head = document.querySelector("main header p")?.textContent ?? "";
    const tiles = [...document.querySelectorAll("ul.grid > li")].map((li) => [li.querySelector(".dh-badge")?.textContent, li.querySelector("img")?.getAttribute("src"), ...[...li.querySelectorAll("[title], [aria-label]")].map((el) => el.getAttribute("title") ?? el.getAttribute("aria-label"))].join("|"));
    return `${head}\n${tiles.join("\n")}`;
  });
const settle = () => page.waitForTimeout(250);

const sections = page.locator("aside details[data-section]");
const count = await sections.count();
check(count >= 5, `expected the filter sections, found ${count}`);
check((await page.locator("aside details[data-section][open]").count()) === 0, "a section is open on first load");

for (let index = 0; index < count; index += 1) await sections.nth(index).locator("summary").click();
check((await page.locator("aside details[data-section]:not([open])").count()) === 0, "a section did not open on click");

const boxes = page.locator("aside details[data-section] input[type=checkbox]:enabled");
const total = await boxes.count();
check(total > 10, `expected the sidebar's checkboxes, found ${total}`);
const before = await grid();
let unchanged = [];
for (let index = 0; index < total; index += 1) {
  const box = boxes.nth(index);
  const name = (await box.evaluate((input) => input.closest("label")?.textContent?.trim())) ?? `#${index}`;
  const was = await box.isChecked();
  // Click, then Space, then the label: each must flip it, and the grid must follow.
  await box.click();
  await settle();
  check((await box.isChecked()) !== was, `${name}: a click did not toggle it`);
  if ((await grid()) === before) unchanged.push(name);
  await box.focus();
  await page.keyboard.press("Space");
  await settle();
  check((await box.isChecked()) === was, `${name}: Space did not toggle it`);
  const label = box.locator("xpath=ancestor::label[1]");
  const size = await label.boundingBox();
  await label.click({ position: { x: Math.max(1, (size?.width ?? 40) - 6), y: (size?.height ?? 20) / 2 } });
  await settle();
  check((await box.isChecked()) !== was, `${name}: a label click did not toggle it`);
  await box.click();
  await settle();
  check((await box.isChecked()) === was, `${name}: did not go back`);
}
check((await grid()) === before, "the grid did not come back after every box was unticked");
// A box can do nothing alone: Uncropped only with no garment ticked, or Drop exposed nudity at 0.5 when no frame
// scores that high. Every other one must change the grid: its tiles, chips, frames, shields or the count.
const quiet = new Set(["Uncropped only", "Drop exposed nudity"]);
unchanged = unchanged.filter((name) => !quiet.has(name.replace(/\s*\(\d+\)$/, "")));
check(unchanged.length === 0, `these boxes left the grid as it was: ${unchanged.join(", ")}`);

// The view switch: in Display, a radio group with counts; it moves the grid, the URL and the section's count.
check((await page.locator("main header").getByText(/^Kept \(\d+\)$/).count()) === 0, "the toolbar still carries the view switch");
const bodyText = await page.locator("body").innerText();
check(!/In-browser|Not in this demo/.test(bodyText), "an In-browser or Not-in-this-demo badge or line is still on the page");
check((await page.locator("aside table").count()) === 0, "the demo still shows a Scans table");
const display = page.locator('aside details[data-section="display"]');
const radios = display.locator('fieldset input[type=radio][name="keep-view"]');
check((await radios.count()) === 3, `expected three view radios in Display, found ${await radios.count()}`);
check((await display.locator("fieldset").first().evaluate((el) => el === el.parentElement?.firstElementChild || el.previousElementSibling?.tagName === "P")) === true, "the view switch is not at the top of Display");
const keptLabel = (await radios.nth(1).evaluate((input) => input.closest("label")?.textContent ?? "")).trim();
check(/^Kept \(\d+\)$/.test(keptLabel), `Kept has no count: "${keptLabel}"`);
const summary = () => display.locator("summary").innerText();
check(!(await summary()).includes("on"), `Display says it has a filter on before any: ${await summary()}`);
const allView = await grid();
await radios.nth(1).locator("xpath=ancestor::label[1]").click();
await settle();
check(await radios.nth(1).isChecked(), "Kept did not select on click");
check(new URL(page.url()).searchParams.get("show") === "kept", `the URL did not take show=kept: ${page.url()}`);
check((await grid()) !== allView, "Kept left the grid as it was");
check((await summary()).includes("1 on"), `Display's summary does not count the view: ${await summary()}`);
await radios.nth(1).focus();
await page.keyboard.press("ArrowRight");
await settle();
check(await radios.nth(2).isChecked(), "ArrowRight did not move to Left out");
check(new URL(page.url()).searchParams.get("show") === "left-out", `the URL did not take show=left-out: ${page.url()}`);
await page.reload();
await page.waitForSelector("ul.grid > li");
await page.waitForFunction(() => !document.body.innerText.includes("Replaying…") && !document.body.innerText.includes("Selecting…"), null, { timeout: 60_000 });
check(await radios.nth(2).isChecked(), "Left out did not survive a reload from the URL");
await radios.nth(2).focus();
await page.keyboard.press("ArrowLeft");
await page.keyboard.press("ArrowLeft");
await settle();
check(await radios.nth(0).isChecked(), "ArrowLeft did not move back to All");
check(!new URL(page.url()).searchParams.has("show"), `All left show in the URL: ${page.url()}`);
check((await grid()) === allView, "All did not put the grid back");

await page.reload();
await page.waitForSelector("ul.grid > li");
check((await page.locator("aside details[data-section]:not([open])").count()) === 0, "opened sections were not remembered across a reload");
check(errors.length === 0, `console errors: ${errors.join(" | ")}`);

await browser.close();
if (!remote) server.close();
if (failures.length > 0) {
  console.error(`sidebar-e2e: ${failures.length} failure(s)\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`sidebar-e2e: ${count} sections, ${total} checkboxes toggle on click, Space and label, and move the grid; the view switch moves the grid and the URL by click and arrow key`);
