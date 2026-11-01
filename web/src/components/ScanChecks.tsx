"use client";

import type { Detectors, Health, ScanSummary } from "@/lib/types";
import { formatYears } from "@/lib/years";

/**
 * What the next scan runs beyond the curator's defaults. The choices live in
 * the URL like the policy, so a shared link scans the same way.
 *
 * Garments: Fashionpedia is the slowest local model and nothing else in the
 * scan waits on it, so it is off unless asked for. Tick it when the wardrobe
 * filters are wanted for the scan.
 *
 * Set: MiVOLO reads a face, so a frame that shows none has no age, and in a
 * set those are often the most explicit frames. With curator 0.7's
 * `faces.set_age`, when one identity holds the scan's faces, those frames
 * take the set's median age. The curator withholds it in a mixed folder and
 * says why; `SetAgeOutcome` shows what the scan on screen did.
 *
 * Bodies: with curator 0.10's `faces.mivolo_body`, MiVOLO reads each person's
 * body as well as the face, and a person the face detector missed gets an age
 * from the body alone. That can only add under-18 holds. It is under
 * evaluation, so it is off unless asked for.
 */
export function ScanChecks({
  detectors,
  health,
  withGarments,
  setAge,
  readBodies,
  disabled,
  onWithGarments,
  onSetAge,
  onReadBodies,
}: {
  detectors: Detectors | null;
  health: Health | null;
  withGarments: boolean;
  setAge: boolean;
  readBodies: boolean;
  disabled: boolean;
  onWithGarments: (on: boolean) => void;
  onSetAge: (on: boolean) => void;
  onReadBodies: (on: boolean) => void;
}) {
  const garments = Boolean(detectors?.garments);
  const set = Boolean(health?.set_age && detectors?.mivolo);
  const bodies = Boolean(detectors?.bodies && detectors?.mivolo);
  if (!garments && !set && !bodies) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-display text-small font-semibold">Checks</h3>
      {garments ? (
        <>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={withGarments} disabled={disabled} onChange={(event) => onWithGarments(event.target.checked)} />
            Garments (Fashionpedia)
          </label>
          <p className="text-caption text-text-muted">{withGarments ? "This scan reads garments, so the wardrobe filters work for it. This is the slowest local check." : "Off by default: the slowest local check, and nothing else waits on it. Turn it on when the wardrobe filters are needed."}</p>
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
        </>
      ) : null}
      {bodies ? (
        <>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={readBodies} disabled={disabled} onChange={(event) => onReadBodies(event.target.checked)} />
            Read bodies too (under evaluation)
          </label>
          <p className="text-caption text-text-muted">
            {readBodies
              ? "MiVOLO reads each person's body as well as the face. A person with no visible face gets a body-only age, which can only add under-18 holds. Slower; crowded frames often give no usable body."
              : "Off by default. Gives MiVOLO each person's body, so a person the face detector missed still gets an age for the under-18 check."}
          </p>
        </>
      ) : null}
    </section>
  );
}

/** What the scan on screen did with the set age, when it was asked for. */
export function SetAgeOutcome({ summary }: { summary: ScanSummary | null }) {
  if (!summary) return null;
  if (summary.set_age) {
    const { years, faces, cluster_id, share } = summary.set_age;
    const frames = summary.results.filter((image) => image.set_age).length;
    return (
      <p className="text-caption text-text-secondary">
        Set age ≈{formatYears(years)}y from {faces} faces in {cluster_id} ({Math.round(share * 100)}%), on {frames} {frames === 1 ? "frame" : "frames"} with no face.
      </p>
    );
  }
  if (summary.set_age_skipped) return <p className="text-caption text-warning">No set age: {summary.set_age_skipped}.</p>;
  return null;
}
