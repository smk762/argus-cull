"use client";

import { folderLabel } from "@/lib/chunks";
import { phaseLabel } from "@/lib/progress";
import type { ScanList as ScanListData } from "@/lib/types";

export function ScanList({
  scans,
  root,
  current,
  onOpen,
}: {
  scans: ScanListData | null;
  root: string | null;
  current: string | null;
  onOpen: (scanId: string, folder: string) => void;
}) {
  if (!scans) return null;
  const active = scans.active;
  const rows = scans.scans.filter((scan) => scan.scan_id !== active?.scan_id);
  if (!active && rows.length === 0) return null;

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
            In progress · {phaseLabel(active.phase)}
            {active.total > 0 ? ` · ${active.done}/${active.total}` : ""}
          </span>
        </button>
      ) : null}
    </section>
  );
}
