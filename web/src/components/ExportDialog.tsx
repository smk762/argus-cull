"use client";

import { useState } from "react";

import type { ExportMode, ExportResult, Progress } from "@/lib/types";

import { closeModal, Modal } from "./Modal";
import { ProgressBar } from "./ProgressBar";

const MODES: { id: ExportMode; label: string; detail: string }[] = [
  { id: "copy", label: "Copy", detail: "Copy the kept files into the output folder and write a manifest. The source folder stays as it is." },
  { id: "symlink", label: "Symlink", detail: "Symlink the kept files into the output folder and write a manifest. The source files stay put." },
  {
    id: "move",
    label: "Move",
    detail: "Move takes each kept file out of the source folder once it lands in the output folder. The moved images leave this scan. This cannot be undone from the page.",
  },
];

function destProblem(dest: string): string | null {
  const trimmed = dest.trim();
  if (!trimmed) return "Choose a folder under the curated output root.";
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) return "Use a relative path inside the curated output root.";
  return null;
}

export function ExportDialog({
  allowMove,
  copyOnly = false,
  initialDest = "selection",
  exportRoot = null,
  sidecars = false,
  kept = null,
  busy,
  progress,
  error,
  result,
  onClose,
  onExport,
  onDownloadExported,
}: {
  allowMove: boolean;
  /** The scan cropped images, which only a copy can write cropped: the curator refuses a symlink or a move. */
  copyOnly?: boolean;
  /** Where the folder field starts: the scan folder's path under the source root, so the output mirrors it. */
  initialDest?: string;
  /** The curator's export root, to show where the files will land. */
  exportRoot?: string | null;
  /** The curator carries sidecars and writes run_stats.json (`export_sidecars`). */
  sidecars?: boolean;
  /** How many images the keep set holds. */
  kept?: number | null;
  busy: boolean;
  progress: Progress | null;
  error: string | null;
  result: ExportResult | null;
  onClose: () => void;
  onExport: (dest: string, mode: ExportMode, writeXmp: boolean) => void;
  onDownloadExported: () => void;
}) {
  const [dest, setDest] = useState(initialDest);
  const [picked, setMode] = useState<ExportMode>("copy");
  // A running scan can crop its first image while the dialog is open.
  const mode = copyOnly ? "copy" : picked;
  const [writeXmp, setWriteXmp] = useState(false);
  const problem = destProblem(dest);
  const chosen = MODES.find((item) => item.id === mode) ?? MODES[0];

  return (
    <Modal labelledBy="export-title" className="max-w-lg space-y-4 p-5" onClose={onClose}>
      <h2 id="export-title" className="font-display text-subheading">
        Export the keep set{kept != null ? ` (${kept} ${kept === 1 ? "image" : "images"})` : ""}
      </h2>
      <label className="block text-small">
        Folder under the curated output root
        <input
          className="mt-1 w-full rounded-md border border-base-600 bg-base-900 px-3 py-2"
          value={dest}
          onChange={(event) => setDest(event.target.value)}
        />
      </label>
      <p className="text-caption text-text-muted">
        Starts as the scan folder&apos;s path under the source root, so the output root mirrors the source&apos;s folders; subfolders inside the scan keep their layout.
        {exportRoot && !problem ? ` Lands in ${exportRoot.replace(/\/$/, "")}/${dest.trim()}.` : ""}
      </p>
      <fieldset className="space-y-2">
        <legend className="text-small text-text-secondary">How to write the files</legend>
        {MODES.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-small">
            <input
              type="radio"
              name="export-mode"
              value={item.id}
              checked={mode === item.id}
              disabled={(item.id === "move" && !allowMove) || (copyOnly && item.id !== "copy")}
              onChange={() => setMode(item.id)}
            />
            {item.label}
            {copyOnly && item.id !== "copy" ? (
              <span className="text-caption text-text-muted">this scan cropped images, so it exports by copy</span>
            ) : item.id === "move" && !allowMove ? (
              <span className="text-caption text-text-muted">needs ALLOW_MOVE=1</span>
            ) : null}
          </label>
        ))}
      </fieldset>
      <p className={mode === "move" ? "text-small text-warning" : "text-small text-text-secondary"}>{chosen.detail}</p>
      <label className="flex items-center gap-2 text-small">
        <input type="checkbox" checked={writeXmp} disabled={busy} onChange={(event) => setWriteXmp(event.target.checked)} />
        Write XMP sidecars
      </label>
      <p className="text-caption text-text-muted">
        Writes face regions, the names from People, and the NudeNet content rating beside each exported file, merged onto the source&apos;s sidecar. Ages are never written. The source sidecar is not changed.
      </p>
      <p className="text-caption text-text-muted">
        {sidecars
          ? "The folder gets manifest.jsonl (what argus-lens, argus-forge and argus-proof read), the CSV report and run_stats.json. Each image's .txt caption, .xmp and .json sidecars go with it, moved, copied or linked the same way."
          : "The folder gets manifest.jsonl and the CSV report. This curator does not carry sidecars or write run stats (curator 0.13 does), so under Move an image's .txt caption stays in the source folder."}
      </p>
      {problem ? <p className="text-caption text-error">{problem}</p> : null}
      {error ? <p className="text-caption text-error">{error}</p> : null}
      {progress ? <ProgressBar progress={progress} /> : null}
      {result ? (
        <p className="text-small text-success">
          {result.mode} wrote {result.copied} files ({result.skipped} skipped)
          {result.xmp_written != null ? `, ${result.xmp_written} XMP ${result.xmp_written === 1 ? "sidecar" : "sidecars"} written` : ""}
          {result.sidecars_carried != null ? `, ${result.sidecars_carried} ${result.sidecars_carried === 1 ? "sidecar" : "sidecars"} carried` : ""}
          {result.run_stats_path ? ", run_stats.json" : ""} into {result.dest}.
          {result.sidecars_failed ? <span className="block text-warning">{result.sidecars_failed} {result.sidecars_failed === 1 ? "sidecar" : "sidecars"} could not be carried; the curator log names them.</span> : null}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-interactive text-on-accent px-3 py-1.5 text-small font-medium disabled:opacity-40"
          disabled={busy || problem !== null || (mode === "move" && !allowMove)}
          onClick={() => onExport(dest.trim(), mode, writeXmp)}
        >
          {busy ? "Exporting…" : `${chosen.label} into the output root`}
        </button>
        {result && Object.keys(result.exported_abs_paths).length > 0 ? (
          <button type="button" className="rounded-md border border-base-600 px-3 py-1.5 text-small" onClick={onDownloadExported}>
            Download exported paths
          </button>
        ) : null}
        <button type="button" className="rounded-md border border-base-600 px-3 py-1.5 text-small" onClick={closeModal}>
          Close
        </button>
      </div>
    </Modal>
  );
}
