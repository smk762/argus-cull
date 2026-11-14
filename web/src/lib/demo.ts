/**
 * The static demo build (`CULL_STATIC=1`, `make pages`): a pure static export
 * that reads a recorded data tape (scripts/record_tape.py) instead of the
 * curator and the page's API routes.
 *
 * Both reads are literal `process.env.NEXT_PUBLIC_*` expressions on purpose:
 * Next inlines them at build time, so the live build (Docker, `npm run build`)
 * never carries the tape code paths and the demo build never calls `/api/*`.
 * next.config.ts maps CULL_STATIC=1 onto NEXT_PUBLIC_CULL_STATIC.
 */
export function staticDemo(): boolean {
  return process.env.NEXT_PUBLIC_CULL_STATIC === "1";
}

/** Where the tape is served from: a path on this site (default `/data-tape`). */
export function tapeBase(): string {
  return (process.env.NEXT_PUBLIC_CULL_TAPE_URL || "/data-tape").replace(/\/+$/, "");
}

export const REPO_URL = "https://github.com/smk762/argus-cull";
export const CURATOR_REPO_URL = "https://github.com/smk762/argus-curator";
export const LIGHTBOX_DEMO_URL = "https://lightbox.dragonhound.dev/";
export const LIGHTBOX_REPO_URL = "https://github.com/smk762/argus-lightbox";

/** One-line reasons beside each control the demo turns off ("Not in this demo"). */
export const OFF = {
  scan: "Scanning runs the curator's GPU models; this page replays one recorded scan.",
  export: "Export writes files on the curator's host.",
  delete: "Delete removes files from the curator's source folder.",
  rerun: "Rerunning a scan needs the curator.",
} as const;

/** What the demo works out in the browser instead of asking the curator ("In-browser"). */
export const IN_BROWSER = {
  keepSet: "Worked out in your browser from the recorded scores, by the curator's rules.",
} as const;

/** Thrown by the static data layer for anything that needs the curator or the page's server. */
export class NotInDemo extends Error {
  constructor(what: string) {
    super(`${what} is not in this demo: it needs the self-hosted curator.`);
    this.name = "NotInDemo";
  }
}
