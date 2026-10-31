"use client";

import { useEffect } from "react";

import { BAND_LABELS, BANDS, type CohortCell, type CohortStats } from "@/lib/cohorts";
import { policyByName, rate, type PolicyStats } from "@/lib/policies";
import type { GuardPolicyInfo } from "@/lib/types";

import { PolicyWording } from "./PolicyWording";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-small tabular-nums">{value}</dd>
    </div>
  );
}

function cellText(cell: CohortCell): string {
  return cell.checked === 0 ? "–" : `${rate(cell.unsafe, cell.checked)} (${cell.unsafe}/${cell.checked})`;
}

/** One cohort: per policy, flag rate on tagged images against the rest of the view, then within each NudeNet band. */
function CohortSection({ cohort }: { cohort: CohortStats }) {
  return (
    <section className="rounded-md border border-base-700 p-3">
      <h4 className="text-small font-semibold">
        {cohort.tag}
        <span className="font-normal text-text-muted">
          {" "}
          · {cohort.group} · {cohort.images} {cohort.images === 1 ? "image" : "images"}
        </span>
      </h4>
      <table className="mt-2 w-full text-caption tabular-nums">
        <thead className="text-text-muted">
          <tr>
            <th className="py-1 text-left font-normal">Policy</th>
            <th className="py-1 text-left font-normal">Tagged</th>
            <th className="py-1 text-left font-normal">Rest of view</th>
            {BANDS.filter((band) => cohort.policies.some((entry) => entry.bands[band].tagged.checked > 0)).map((band) => (
              <th key={band} className="py-1 text-left font-normal">
                {BAND_LABELS[band]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohort.policies.map((entry) => (
            <tr key={entry.policy} className="border-t border-base-700">
              <td className="py-1 pr-2 text-text-secondary">
                {entry.policy}
                {entry.official ? <span className="text-text-muted"> · official</span> : null}
              </td>
              <td className="py-1 pr-2">{cellText(entry.tagged)}</td>
              <td className="py-1 pr-2 text-text-secondary">{cellText(entry.rest)}</td>
              {BANDS.filter((band) => cohort.policies.some((item) => item.bands[band].tagged.checked > 0)).map((band) => (
                <td key={band} className="py-1 pr-2">
                  {cellText(entry.bands[band].tagged)}
                  <span className="text-text-muted"> vs {cellText(entry.bands[band].rest)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Flag rate per policy, agreement with the official one, precision and recall against the labels, and flag rate by cohort. */
export function PolicyDialog({
  stats,
  total,
  labelled,
  cohorts = [],
  cohortTotal = 0,
  cohortNotes = [],
  onClose,
  onDownloadLabels,
  catalog = null,
}: {
  stats: PolicyStats[];
  total: number;
  labelled: number;
  /** Setting and wardrobe cohorts present in the view, before any cohort filter. */
  cohorts?: CohortStats[];
  cohortTotal?: number;
  /** Why cohorts may be missing: a broken cohorts.json or an unmounted source folder. */
  cohortNotes?: string[];
  onClose: () => void;
  onDownloadLabels: (() => void) | null;
  /** Curator 0.8: the wording of each named policy. */
  catalog?: readonly GuardPolicyInfo[] | null;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/80 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-title"
        className="max-h-[90dvh] w-full max-w-3xl overflow-auto rounded-xl bg-base-800 p-4 shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="policy-title" className="font-display text-subheading">
            SingGuard policies
          </h2>
          <div className="flex gap-2">
            {onDownloadLabels ? (
              <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small" onClick={onDownloadLabels}>
                Download labels
              </button>
            ) : null}
            <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <p className="text-caption text-text-muted">
          {total} images in this view, {labelled} labelled. Flag rate is unsafe verdicts over images the policy checked. Precision and recall score each policy against the
          labels: hard, ambiguous, and other (and a proxy) should be flagged; adult and safe should pass.
        </p>
        {stats.length === 0 ? <p className="mt-4 text-small text-text-secondary">No policy has judged these images.</p> : null}
        <div className="mt-4 space-y-4">
          {stats.map((entry) => {
            const rules = Object.entries(entry.rules).sort(([, left], [, right]) => right - left);
            const precision = entry.tp + entry.fp;
            const recall = entry.tp + entry.fn;
            return (
              <section key={entry.policy} className="rounded-md border border-base-700 p-3">
                <h3 className="text-small font-semibold">
                  {entry.policy}
                  {entry.official ? <span className="font-normal text-text-muted"> · official</span> : null}
                </h3>
                <dl className="mt-2 grid gap-3 sm:grid-cols-3">
                  <Stat label="Flag rate" value={`${rate(entry.unsafe, entry.checked)} · ${entry.unsafe} of ${entry.checked}`} />
                  {entry.agreement ? (
                    <>
                      <Stat label="Flags where official passes" value={`${entry.agreement.onlyThis}`} />
                      <Stat label="Passes where official flags" value={`${entry.agreement.onlyOfficial}`} />
                    </>
                  ) : null}
                  {entry.labelled > 0 ? (
                    <>
                      <Stat label="Precision" value={`${rate(entry.tp, precision)} · ${entry.tp} of ${precision} flags right`} />
                      <Stat label="Recall" value={`${rate(entry.tp, recall)} · ${entry.tp} of ${recall} positives caught`} />
                      <Stat label="False positive · negative" value={`${entry.fp} · ${entry.fn}`} />
                    </>
                  ) : (
                    <Stat label="Against labels" value="no labelled image checked" />
                  )}
                </dl>
                {rules.length > 0 ? (
                  <p className="mt-2 text-caption text-text-muted">Rules: {rules.map(([rule, count]) => `${rule} ×${count}`).join(" · ")}</p>
                ) : null}
                <div className="mt-2">
                  <PolicyWording info={policyByName(catalog, entry.policy)} />
                </div>
              </section>
            );
          })}
        </div>
        {cohorts.length > 0 || cohortNotes.length > 0 ? (
          <div className="mt-6">
            <h3 className="font-display text-small font-semibold">By setting and wardrobe</h3>
            <p className="mt-1 text-caption text-text-muted">
              Tags from cohorts.json over the Places365 categories and the caption sidecars, or set by hand in the detail view. Each row reads the policy&apos;s flag rate on tagged images
              against the rest of the {cohortTotal} images in the view. Wardrobe moves the NudeNet score too, so the band columns compare like with like.
            </p>
            {cohortNotes.map((note) => (
              <p key={note} className="mt-1 text-caption text-warning">
                {note}
              </p>
            ))}
            <div className="mt-3 space-y-3">
              {cohorts.map((cohort) => (
                <CohortSection key={cohort.tag} cohort={cohort} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
