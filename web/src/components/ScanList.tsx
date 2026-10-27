"use client";

import { useEffect, useState } from "react";

import { folderLabel } from "@/lib/chunks";
import { phaseLabel } from "@/lib/progress";
import type { ScanList as ScanListData } from "@/lib/types";

export function ScanList({
  scans,
  root,
  current,
  canPurge = false,
  purging = false,
  onOpen,
  onPurge,
}: {
  scans: ScanListData | null;
  root: string | null;
  current: string | null;
  /** The curator can stop a scan and purge its cache (0.7 and later). */
  canPurge?: boolean;
  purging?: boolean;
  onOpen: (scanId: string, folder: string) => void;
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
      {rows.length > 0 ? (
      <ul className="space-y-1">
        {rows.map((scan) => {
          const folder = folderLabel(scan.folder, root);
          return (
            <li key={scan.scan_id}>
              <button
                type="button"
                className={`flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1 text-left text-small hover:bg-base-700 ${current === scan.scan_id ? "text-accent-tertiary" : ""}`}
                onClick={() => onOpen(scan.scan_id, folder.rel)}
              >
                <span className="truncate">{folder.label}</span>
                <span className="shrink-0 text-caption text-text-muted">{scan.total}</span>
              </button>
            </li>
          );
        })}
      </ul>
      ) : null}
      {active ? (
        <button
          type="button"
          className={`block w-full rounded-md border px-2 py-2 text-left ${current === active.scan_id ? "border-accent-primary" : "border-base-600"}`}
          onClick={() => onOpen(active.scan_id, folderLabel(active.folder, root).rel)}
        >
          <span className="block truncate text-small">{folderLabel(active.folder, root).label}</span>
          <span className="block text-caption text-accent-tertiary">
            {active.cancelling ? "Stopping" : "In progress"} · {phaseLabel(active.phase)}
            {active.total > 0 ? ` · ${active.done}/${active.total}` : ""}
          </span>
        </button>
      ) : null}
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
