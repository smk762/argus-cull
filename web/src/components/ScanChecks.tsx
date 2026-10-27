"use client";

import type { Detectors, Health, ScanSummary } from "@/lib/types";

/**
 * What the next scan runs beyond the curator's defaults. The choices live in
 * the URL like the policy, so a shared link scans the same way.
 *
 * Garments: Fashionpedia is the slowest local model and nothing else in the
 * scan waits on it, so a scan that does not need the wardrobe filters runs
 * faster without it.
 *
 * Set: MiVOLO reads a face, so a frame that shows none has no age, and in a
 * set those are often the most explicit frames. With curator 0.7's
 * `faces.set_age`, when one identity holds the scan's faces, those frames
 * take the set's median age. The curator withholds it in a mixed folder and
 * says why; the last scan's outcome is shown under the box.
 */
export function ScanChecks({
  detectors,
  health,
  summary,
  skipGarments,
  setAge,
  disabled,
  onSkipGarments,
  onSetAge,
}: {
  detectors: Detectors | null;
  health: Health | null;
  summary: ScanSummary | null;
  skipGarments: boolean;
  setAge: boolean;
  disabled: boolean;
  onSkipGarments: (skip: boolean) => void;
  onSetAge: (on: boolean) => void;
}) {
  const garments = Boolean(detectors?.garments);
  const set = Boolean(health?.set_age && detectors?.mivolo);
  if (!garments && !set) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-display text-small font-semibold">Scan checks</h2>
      {garments ? (
        <>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={!skipGarments} disabled={disabled} onChange={(event) => onSkipGarments(!event.target.checked)} />
            Garments (Fashionpedia)
          </label>
          <p className="text-caption text-text-muted">{skipGarments ? "The next scan skips garment detection, so the wardrobe filters stay empty for it." : "The slowest local check. Turn it off when the wardrobe filters are not needed."}</p>
        </>
      ) : null}
      {set ? (
        <>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={setAge} disabled={disabled} onChange={(event) => onSetAge(event.target.checked)} />
            Set: one person
          </label>
          <p className="text-caption text-text-muted">
            {setAge
              ? "Frames with no face take the set's median MiVOLO age, shown as ≈ set, when one identity holds at least 90% of the scan's faces. A mixed folder gets nothing."
              : "For a folder that is one set of one person: frames with no face take the set's age, so the under-18 check has something to go on."}
          </p>
          <SetAgeOutcome summary={summary} />
        </>
      ) : null}
    </section>
  );
}

/** What the scan on screen did with the set age, when it was asked for. */
function SetAgeOutcome({ summary }: { summary: ScanSummary | null }) {
  if (!summary) return null;
  if (summary.set_age) {
    const { years, faces, cluster_id, share } = summary.set_age;
    const frames = summary.results.filter((image) => image.set_age).length;
    return (
      <p className="text-caption text-text-secondary">
        This scan: ≈{Math.round(years)}y from {faces} faces in {cluster_id} ({Math.round(share * 100)}%), on {frames} {frames === 1 ? "frame" : "frames"} with no face.
      </p>
    );
  }
  if (summary.set_age_skipped) return <p className="text-caption text-warning">This scan gave no set age: {summary.set_age_skipped}.</p>;
  return null;
}
