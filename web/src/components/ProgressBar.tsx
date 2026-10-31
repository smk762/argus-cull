import { phaseLabel, progressRatio } from "@/lib/progress";
import type { Progress } from "@/lib/types";

function Row({ progress }: { progress: Progress }) {
  const ratio = progressRatio(progress);
  const pct = ratio == null ? null : Math.round(ratio * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-caption">
        <span>{phaseLabel(progress.phase)}</span>
        <span className="tabular-nums text-text-muted">
          {pct == null ? "Working…" : `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()} (${pct}%)`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-base-700">
        <div
          className={`h-full rounded-full bg-accent-tertiary transition-[width] duration-300 ease-out ${pct == null ? "w-1/4 animate-pulse" : ""}`}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** One row per phase in flight. Face detection and NudeNet run together, so there can be two. */
export function ProgressBar({ progress }: { progress: Progress | readonly Progress[] }) {
  const rows = Array.isArray(progress) ? (progress as readonly Progress[]) : [progress as Progress];
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {rows.map((row) => (
        <Row key={row.phase} progress={row} />
      ))}
    </div>
  );
}
