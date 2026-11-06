"use client";

import { cropMaxCutPercent, DEFAULT_CROP_MAX_CUT, MAX_CROP_MAX_CUT, MIN_CROP_MAX_CUT, PREFILTERS, type Detectors, type Health, type Prefilter, type ScanSummary } from "@/lib/types";
import { formatYears } from "@/lib/years";

import { Info } from "./Tooltip";

const DROP_LABELS: Record<Prefilter, { label: string; info: string }> = {
  nsfw: {
    label: "Drop NSFW",
    info: "Drops an image whose exposed reading (NudeNet, or EraX filling in) is 0.2 or more. An image neither could score goes on.",
  },
  "no-face": { label: "Drop no face", info: "Drops an image with no detected face." },
  "no-age": {
    label: "Drop no age",
    info: "Drops an image with no MiVOLO age from a face or a body, and no set age. With Set: one person on, faceless frames that take the set age go on.",
  },
};

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
  drops = [],
  cropWatermarks = false,
  cropMaxCut = DEFAULT_CROP_MAX_CUT,
  disabled,
  onWithGarments,
  onSetAge,
  onReadBodies,
  onDrops,
  onCropWatermarks,
  onCropMaxCut,
}: {
  detectors: Detectors | null;
  health: Health | null;
  withGarments: boolean;
  setAge: boolean;
  readBodies: boolean;
  drops?: readonly Prefilter[];
  cropWatermarks?: boolean;
  cropMaxCut?: number;
  disabled: boolean;
  onWithGarments: (on: boolean) => void;
  onSetAge: (on: boolean) => void;
  onReadBodies: (on: boolean) => void;
  onDrops?: (drops: Prefilter[]) => void;
  onCropWatermarks?: (on: boolean) => void;
  onCropMaxCut?: (percent: number) => void;
}) {
  const garments = Boolean(detectors?.garments);
  const set = Boolean(health?.set_age && detectors?.mivolo);
  const bodies = Boolean(detectors?.bodies && detectors?.mivolo);
  const faces = Boolean(detectors?.insightface || detectors?.mivolo);
  // Each drop needs the check it reads: NudeNet or EraX, face detection, MiVOLO.
  const offered: Record<Prefilter, boolean> = { nsfw: Boolean(detectors?.nudenet || detectors?.erax), "no-face": faces, "no-age": Boolean(detectors?.mivolo) };
  const prefilter = Boolean(health?.prefilter && onDrops) && PREFILTERS.some((kind) => offered[kind]);
  const crop = Boolean(health?.watermark_detect && detectors?.watermark && onCropWatermarks);
  if (!garments && !set && !bodies && !prefilter && !crop) return null;
  return (
    <section className="space-y-2">
      {prefilter && onDrops ? (
        <div className="space-y-1.5 rounded-md border border-base-600 p-2">
          <h3 className="flex items-center gap-1.5 font-display text-small font-semibold">
            Drop before the slow checks
            <Info text="A dropped image skips scenes, garments and SingGuard. It stays in the scan as a reject named prefilter:<kind>, so it is never kept or exported, Hide rejected hides it, and Run stats count it apart." />
          </h3>
          {PREFILTERS.filter((kind) => offered[kind]).map((kind) => (
            <div key={kind} className="flex items-center gap-1.5 text-small">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={drops.includes(kind)}
                  disabled={disabled}
                  onChange={(event) => onDrops(event.target.checked ? PREFILTERS.filter((other) => other === kind || drops.includes(other)) : drops.filter((other) => other !== kind))}
                />
                {DROP_LABELS[kind].label}
              </label>
              <Info text={DROP_LABELS[kind].info} />
            </div>
          ))}
        </div>
      ) : null}
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
      {crop && onCropWatermarks ? (
        <>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={cropWatermarks} disabled={disabled} onChange={(event) => onCropWatermarks(event.target.checked)} />
            Crop watermarks
            <Info text={`Each frame goes to the watermark detector first. A watermark at the edge is cut away, taking only what it needs, up to ${cropMaxCut}% of a side per edge, and every check (faces, NudeNet, SingGuard) sees the cropped frame; export writes it cropped (copy only). A watermark no edge cut removes rejects the frame as crop:overlay; one the detector could not check is crop:unchecked. Source files are never changed.`} />
          </label>
          <p className="text-caption text-text-muted">
            {cropWatermarks
              ? "This scan crops watermarks at the edges before every check, so verdicts read the frame without them. Scan the folder again with this off to compare."
              : "Off by default: it changes what every check sees. Turn it on to scan with edge watermarks cut away, and compare against a run without."}
          </p>
          {cropWatermarks && onCropMaxCut ? (
            <label className="flex flex-col gap-1 text-small">
              <span>Most one edge may lose: {cropMaxCut}%</span>
              <input type="range" min={MIN_CROP_MAX_CUT} max={MAX_CROP_MAX_CUT} value={cropMaxCut} disabled={disabled} onChange={(event) => onCropMaxCut(cropMaxCutPercent(event.target.valueAsNumber))} />
              <span className="text-caption text-text-muted">A limit, not a fixed cut: each edge loses only what clears the watermark. Raise it and fewer frames reject as crop:overlay, but a deep cut can take part of the subject.</span>
            </label>
          ) : null}
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
