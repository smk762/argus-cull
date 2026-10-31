"use client";

import { useEffect, useState } from "react";

import { folderLabel } from "@/lib/chunks";
import { phaseLabel } from "@/lib/progress";
import { ago } from "@/lib/time";
import type { ScanList as ScanListData } from "@/lib/types";

/**
 * Every scan the curator holds, newest first, with the one running on top.
 * A row opens its scan; Again opens the scan form filled the way that scan
 * ran, so the next run differs only in what the viewer changes.
 */
export function ScansTable({
  scans,
  root,
  current,
  canPurge = false,
  purging = false,
  rerunning = null,
  onOpen,
  onRerun,
  onPurge,
}: {
  scans: ScanListData | null;
  root: string | null;
  current: string | null;
  /** The curator can stop a scan and purge its cache (0.6 and later). */
  canPurge?: boolean;
  purging?: boolean;
  /** The scan whose parameters are being read back into the form. */
  rerunning?: string | null;
  onOpen: (scanId: string, folder: string) => void;
  onRerun?: (scanId: string) => void;
  onPurge?: () => void;
}) {
  // Purge asks twice; the second ask lapses after a few seconds.
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), 5000);
    return () => clearTimeout(timer);
  }, [confirm]);

  if (!scans) return null;
  const active = scans.active;
  const rows = scans.scans.filter((scan) => scan.scan_id !== active?.scan_id);
  if (!active && rows.length === 0) return null;
  const count = rows.length + (active ? 1 : 0);

  return (
    <section className="space-y-2">
      <h2 className="font-display text-small font-semibold">Scans</h2>
      <table className="w-full table-fixed border-collapse text-small">
        <thead className="text-caption text-text-muted">
          <tr>
            <th scope="col" className="py-1 pr-2 text-left font-normal">
              Folder
            </th>
            <th scope="col" className="w-12 py-1 pr-2 text-right font-normal">
              Images
            </th>
            <th scope="col" className="w-[4.5rem] py-1 pr-2 text-right font-normal">
              When
            </th>
            <th scope="col" className="w-12 py-1 text-right font-normal">
              <span className="sr-only">Run again</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {active ? (
            <tr className={`border-t border-base-700 ${current === active.scan_id ? "text-accent-tertiary" : ""}`}>
              <td className="py-1 pr-2" colSpan={3}>
                <button type="button" className="block w-full truncate text-left hover:underline" title={active.folder} onClick={() => onOpen(active.scan_id, folderLabel(active.folder, root).rel)}>
                  {folderLabel(active.folder, root).label}
                </button>
                <span className="block truncate text-caption text-accent-tertiary">
                  {active.cancelling ? "Stopping" : "In progress"} · {phaseLabel(active.phase)}
                  {active.total > 0 ? ` · ${active.done}/${active.total}` : ""}
                </span>
              </td>
              <td className="py-1" />
            </tr>
          ) : null}
          {rows.map((scan) => {
            const folder = folderLabel(scan.folder, root);
            const open = current === scan.scan_id;
            return (
              <tr key={scan.scan_id} className={`border-t border-base-700 ${open ? "text-accent-tertiary" : ""}`}>
                <td className="py-1 pr-2">
                  <button type="button" className="block w-full truncate text-left hover:underline" title={scan.folder} aria-current={open ? "true" : undefined} onClick={() => onOpen(scan.scan_id, folder.rel)}>
                    {folder.label}
                  </button>
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-text-secondary">{scan.total}</td>
                <td className="py-1 pr-2 text-right text-caption text-text-muted" title={scan.updated_at}>
                  {ago(scan.updated_at)}
                </td>
                <td className="py-1 text-right">
                  {onRerun ? (
                    <button
                      type="button"
                      className="rounded-md border border-base-600 px-1.5 py-0.5 text-caption text-text-secondary hover:border-accent-primary hover:text-text-primary disabled:opacity-40"
                      disabled={rerunning != null}
                      title="Open the scan form filled the way this scan ran"
                      onClick={() => onRerun(scan.scan_id)}
                    >
                      {rerunning === scan.scan_id ? "…" : "Again"}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canPurge && onPurge ? (
        <div className="space-y-1">
          <button
            type="button"
            className={`w-full rounded-md border px-2 py-1 text-small disabled:opacity-40 ${confirm ? "border-warning text-warning" : "border-base-600 text-text-secondary hover:border-warning hover:text-warning"}`}
            disabled={purging}
            onClick={() => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              setConfirm(false);
              onPurge();
            }}
          >
            {purging ? "Purging…" : confirm ? `Confirm purge (${count} scan${count === 1 ? "" : "s"})` : "Purge all"}
          </button>
          {confirm ? (
            <p className="text-caption text-text-muted">
              {active ? "Stops the running scan and removes" : "Removes"} every cached scan from the curator. Source images, labels and cohorts stay.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
