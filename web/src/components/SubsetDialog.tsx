"use client";

import { useEffect } from "react";

import type { SubsetReport } from "@/lib/subset";

export function SubsetDialog({ report, onClose }: { report: SubsetReport; onClose: () => void }) {
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
        aria-labelledby="subset-title"
        className="max-h-[90dvh] w-full max-w-xl overflow-auto rounded-xl bg-base-800 p-4 shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="subset-title" className="font-display text-subheading">
            {report.title}
          </h2>
          <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-caption text-text-muted">
          Counts from the current keep set. This does not rescan, and it does not change which files are kept.
        </p>
        {report.stats.length > 0 ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {report.stats.map((stat) => (
              <div key={stat.label}>
                <dt className="text-caption text-text-muted">{stat.label}</dt>
                <dd className="text-small">{stat.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <ul className="mt-4 space-y-2 text-small text-text-secondary">
          {report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
