"use client";

import { useEffect, useState } from "react";

import { folderLabel } from "@/lib/chunks";
import { phaseLabel } from "@/lib/progress";
import { ago } from "@/lib/time";
import type { ScanList as ScanListData } from "@/lib/types";

/**
 * Every scan the curator holds, newest first, with the one running on top.
 * A row opens its scan; Again opens the scan form filled the way that scan
 * ran, so the next run differs only in what the viewer changes. The bin
 * removes that one scan from the curator's cache (asks twice, like Purge all).
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
  canForget = false,
  forgetting = null,
  onForget,
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
  /** The curator can remove one cached scan (`DELETE /scan/{id}`, 0.12 and later). */
  canForget?: boolean;
  /** The scan being removed. */
  forgetting?: string | null;
  onForget?: (scanId: string) => void;
}) {
  // Purge asks twice; the second ask lapses after a few seconds.
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), 5000);
    return () => clearTimeout(timer);
  }, [confirm]);
  // The row whose bin was clicked once; the second click removes it. Lapses like the purge ask.
  const [confirmRow, setConfirmRow] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmRow) return;
    const timer = setTimeout(() => setConfirmRow(null), 5000);
    return () => clearTimeout(timer);
  }, [confirmRow]);
  const forget = canForget && onForget ? onForget : null;

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
            {forget ? (
              <th scope="col" className="w-7 py-1 text-right font-normal">
                <span className="sr-only">Remove</span>
              </th>
            ) : null}
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
              {forget ? <td className="py-1" /> : null}
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
                {forget ? (
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border disabled:opacity-40 ${confirmRow === scan.scan_id ? "border-warning text-warning" : "border-transparent text-text-muted hover:border-warning hover:text-warning"}`}
                      disabled={forgetting != null || purging}
                      title={confirmRow === scan.scan_id ? "Click again to remove this scan. Source images stay." : "Remove this scan from the curator's cache. Source images, labels and cohorts stay."}
                      aria-label={confirmRow === scan.scan_id ? `Confirm removing the scan of ${folder.label}` : `Remove the scan of ${folder.label}`}
                      onClick={() => {
                        if (confirmRow !== scan.scan_id) {
                          setConfirmRow(scan.scan_id);
                          return;
                        }
                        setConfirmRow(null);
                        forget(scan.scan_id);
                      }}
                    >
                      {forgetting === scan.scan_id ? (
                        "…"
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                        </svg>
                      )}
                    </button>
                  </td>
                ) : null}
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
