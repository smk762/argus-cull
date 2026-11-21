"use client";

import type { SubsetReport } from "@/lib/subset";

import { closeModal, Modal } from "./Modal";

export function SubsetDialog({ report, onClose, onOpenFrame }: { report: SubsetReport; onClose: () => void; onOpenFrame: (relPath: string) => void }) {
  return (
    <Modal labelledBy="subset-title" className="max-w-xl p-4" onClose={onClose}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 id="subset-title" className="font-display text-subheading">
          {report.title}
        </h2>
        <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small" onClick={closeModal}>
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
      {report.frames.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {report.frames.map((frame) => (
            <button
              key={frame.relPath}
              type="button"
              className="rounded-md border border-base-600 px-3 py-1 text-small"
              onClick={(event) => {
                closeModal(event);
                onOpenFrame(frame.relPath);
              }}
            >
              {frame.label}
            </button>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
