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

/** The tooltip on each control the demo shows disabled: why it is off. */
export const OFF = {
  export: "Not in this demo: export writes files on the curator's host.",
  delete: "Not in this demo: delete removes files from the curator's source folder.",
} as const;

/** The one line in About this tape that says what runs here and what does not. */
export const DEMO_RUNS_HERE = "Everything here runs in your browser from the recording; scanning, export and delete need a running curator.";

/** Thrown by the static data layer for anything that needs the curator or the page's server. */
export class NotInDemo extends Error {
  constructor(what: string) {
    super(`${what} is not in this demo: it needs the self-hosted curator.`);
    this.name = "NotInDemo";
  }
}
