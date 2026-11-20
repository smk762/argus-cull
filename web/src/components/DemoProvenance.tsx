import { Fragment } from "react";

import { CURATOR_REPO_URL, DEMO_RUNS_HERE, tapeBase } from "@/lib/demo";
import type { Tape } from "@/lib/tape";

import { DemoBadge } from "./DemoBadge";
import { ExternalLink } from "./ExternalLink";

function day(iso: string): string {
  return iso.slice(0, 10);
}

/** Checks the recorded scan ran, from its config, in the order the page lists them. */
export function checksLine(config: Record<string, unknown>): string {
  const on = (key: string, field = "enabled") => (config[key] as Record<string, unknown> | undefined)?.[field] === true;
  const guard = config.guard_config as { enabled?: boolean; policy?: string; variants?: string[] } | undefined;
  const parts = [
    on("faces_config") ? (on("faces_config", "mivolo") ? "faces + MiVOLO ages" : "faces") : null,
    on("nsfw_config") ? "NudeNet" : null,
    on("erax_config") ? "EraX" : null,
    on("scenes_config") ? "Places365" : null,
    on("garments_config") ? "Fashionpedia" : null,
    on("crop_config") ? "watermark crops" : null,
    guard?.enabled ? `SingGuard ${guard.policy ?? ""}${guard.variants?.length ? ` + ${guard.variants.join(", ")}` : ""}`.trim() : null,
  ];
  return parts.filter(Boolean).join(" · ") || "quality only";
}

/**
 * What the demo shows and where it came from, in the sidebar where the live
 * page says whether the curator is up: the Recorded or Sample data badge, the
 * curator version and date, and the scan's checks and counts folded below,
 * with the one line on what runs here and the button that drops this
 * browser's label edits.
 */
export function DemoProvenance({ tape, error, onResetLabels = null }: { tape: Tape | null; error: string | null; onResetLabels?: (() => void) | null }) {
  if (error) return <p className="text-caption text-error" role="status">{error}</p>;
  if (!tape) return <p className="text-caption text-text-muted" role="status">Loading the recorded scan…</p>;
  const { provenance, stats } = tape;
  const version = provenance.curator.version;
  const sample = provenance.kind === "sample";
  return (
    <div className="space-y-2 text-caption text-text-secondary" role="status">
      <p className="flex flex-wrap items-center gap-2">
        <DemoBadge state={sample ? "sample" : "recorded"} />
        {sample ? "Hand-written results on a stand-in set." : `Recorded from argus-curator${version ? ` ${version}` : ""} on ${day(tape.generated_at)}.`}
      </p>
      {provenance.note ? <p className="text-text-muted">{provenance.note}</p> : null}
      <details className="text-text-muted">
        <summary className="cursor-pointer hover:text-text-primary">About this tape</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>Generated</dt>
          <dd>
            <time dateTime={tape.generated_at}>{tape.generated_at.replace("T", " ").replace("Z", " UTC")}</time>
          </dd>
          <dt>Curator</dt>
          <dd>
            {version ?? "unknown"}
            {provenance.curator.commit ? ` (${provenance.curator.commit.slice(0, 9)})` : ""}
          </dd>
          <dt>Source</dt>
          <dd>{provenance.source === "curator" ? "a running curator" : "a saved scan and its images"}</dd>
          <dt>Checks</dt>
          <dd>{checksLine(tape.scan_config)}</dd>
          <dt>Images</dt>
          <dd>
            {stats.total} scanned · {stats.passed ?? "?"} passed · {stats.rejected ?? "?"} rejected
            {stats.kept != null ? ` · ${stats.kept} kept` : ""}
          </dd>
        </dl>
        {provenance.about?.length ? (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" aria-label="About the images">
            {provenance.about.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.text}</dd>
              </Fragment>
            ))}
          </dl>
        ) : null}
        {provenance.document && /^[\w.-]+$/.test(provenance.document) ? (
          <p className="mt-2">
            <a className="underline underline-offset-2 hover:text-text-primary" href={`${tapeBase()}/${provenance.document}`}>
              Full provenance
            </a>{" "}
            (recipe, prompts, licences).
          </p>
        ) : null}
        <p className="mt-2">
          No model runs while you browse. Scores, ages and verdicts are{" "}
          <ExternalLink className="underline underline-offset-2" href={CURATOR_REPO_URL}>
            argus-curator
          </ExternalLink>
          &apos;s, as recorded.
        </p>
        <p className="mt-2">{DEMO_RUNS_HERE}</p>
        {onResetLabels ? (
          <button
            type="button"
            className="mt-2 rounded-md border border-base-600 px-2 py-0.5 text-caption text-text-secondary hover:border-accent-primary hover:text-text-primary"
            title="Label and tag edits are kept in this browser; this puts back the labels the tape recorded."
            onClick={onResetLabels}
          >
            Reset to the recorded labels
          </button>
        ) : null}
      </details>
    </div>
  );
}
