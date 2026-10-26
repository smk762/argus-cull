"use client";

import { useState } from "react";

import type { ExportMode, ExportResult, Progress } from "@/lib/types";

const MODES: { id: ExportMode; label: string; detail: string }[] = [
  { id: "copy", label: "Copy", detail: "Copy the kept files into the export root and write a manifest. The source folder stays as it is." },
  { id: "symlink", label: "Symlink", detail: "Symlink the kept files into the export root and write a manifest. The source files stay put." },
  {
    id: "move",
    label: "Move",
    detail: "Move deletes each kept file from the source folder after it lands in the export root. This cannot be undone from the demo.",
  },
];

function destProblem(dest: string): string | null {
  const trimmed = dest.trim();
  if (!trimmed) return "Choose a folder name under the export root.";
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) return "Use a relative path inside the export root.";
  return null;
}

export function ExportDialog({
  allowMove,
  busy,
  progress,
  error,
  result,
  onClose,
  onExport,
  onDownloadExported,
}: {
  allowMove: boolean;
  busy: boolean;
  progress: Progress | null;
  error: string | null;
  result: ExportResult | null;
  onClose: () => void;
  onExport: (dest: string, mode: ExportMode) => void;
  onDownloadExported: () => void;
}) {
  const [dest, setDest] = useState("selection");
  const [mode, setMode] = useState<ExportMode>("copy");
  const problem = destProblem(dest);
  const chosen = MODES.find((item) => item.id === mode) ?? MODES[0];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="w-full max-w-lg space-y-4 rounded-xl bg-base-800 p-5 shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="export-title" className="font-display text-subheading">
          Export the current selection
        </h2>
        <label className="block text-small">
          Folder under the export root
          <input
            className="mt-1 w-full rounded-md border border-base-600 bg-base-900 px-3 py-2"
            value={dest}
            onChange={(event) => setDest(event.target.value)}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-small text-text-secondary">How to write the files</legend>
          {MODES.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-small">
              <input
                type="radio"
                name="export-mode"
                value={item.id}
                checked={mode === item.id}
                disabled={item.id === "move" && !allowMove}
                onChange={() => setMode(item.id)}
              />
              {item.label}
              {item.id === "move" && !allowMove ? (
                <span className="text-caption text-text-muted">needs --allow-move</span>
              ) : null}
            </label>
          ))}
        </fieldset>
        <p className={mode === "move" ? "text-small text-warning" : "text-small text-text-secondary"}>{chosen.detail}</p>
        {problem ? <p className="text-caption text-error">{problem}</p> : null}
        {error ? <p className="text-caption text-error">{error}</p> : null}
        {progress ? (
          <p className="text-caption text-text-secondary">
            {progress.phase} {progress.done}/{progress.total}
          </p>
        ) : null}
        {result ? (
          <p className="text-small text-success">
            {result.mode} wrote {result.copied} files ({result.skipped} skipped).
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-interactive px-3 py-1.5 text-small font-medium disabled:opacity-40"
            disabled={busy || problem !== null || (mode === "move" && !allowMove)}
            onClick={() => onExport(dest.trim(), mode)}
          >
            {busy ? "Exporting…" : `${chosen.label} into the export root`}
          </button>
          {result && Object.keys(result.exported_abs_paths).length > 0 ? (
            <button type="button" className="rounded-md border border-base-600 px-3 py-1.5 text-small" onClick={onDownloadExported}>
              Download exported paths
            </button>
          ) : null}
          <button type="button" className="rounded-md border border-base-600 px-3 py-1.5 text-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
