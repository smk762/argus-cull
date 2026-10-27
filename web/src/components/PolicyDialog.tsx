"use client";

import { useEffect } from "react";

import { rate, type PolicyStats } from "@/lib/policies";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-small tabular-nums">{value}</dd>
    </div>
  );
}

/** Flag rate per policy, agreement with the official one, and precision and recall against the labels. */
export function PolicyDialog({
  stats,
  total,
  labelled,
  onClose,
  onDownloadLabels,
}: {
  stats: PolicyStats[];
  total: number;
  labelled: number;
  onClose: () => void;
  onDownloadLabels: (() => void) | null;
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
        className="max-h-[90dvh] w-full max-w-2xl overflow-auto rounded-xl bg-base-800 p-4 shadow-soft"
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
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
