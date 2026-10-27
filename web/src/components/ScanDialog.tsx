"use client";

import { useEffect, useState } from "react";

import { getFolders } from "@/lib/api";
import { templateSummary, type ScanTemplate } from "@/lib/scanTemplate";
import type { Detectors, FolderListing, Health } from "@/lib/types";

import { FolderPicker } from "./FolderPicker";
import { PolicyPicker } from "./PolicyPicker";
import { ScanChecks } from "./ScanChecks";

/**
 * The scan form: folder, SingGuard policy, and the checks to run. Opened empty
 * from New scan, or filled from a finished scan by Run again, so a second run
 * of the same set differs from the first only in what the viewer changes.
 * Nothing is written to the page until Scan is pressed; browsing folders here
 * leaves the scan on screen alone.
 */
export function ScanDialog({
  initial,
  from,
  detectors,
  health,
  canScan,
  busyLabel,
  onClose,
  onScan,
}: {
  initial: ScanTemplate;
  /** The folder of the scan this form was filled from, when it was. */
  from: string | null;
  detectors: Detectors | null;
  health: Health | null;
  /** The curator is up and no scan is running. */
  canScan: boolean;
  /** Why Scan is off, when it is: "Scan in progress" or the curator's trouble. */
  busyLabel: string | null;
  onClose: () => void;
  onScan: (template: ScanTemplate) => void;
}) {
  const [draft, setDraft] = useState<ScanTemplate>(initial);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [listingError, setListingError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancel = false;
    getFolders(draft.folder)
      .then((body) => {
        if (cancel) return;
        setListing(body);
        setListingError(null);
      })
      .catch((err: unknown) => {
        if (!cancel) setListingError(err instanceof Error ? err.message : "Could not list folders.");
      });
    return () => {
      cancel = true;
    };
  }, [draft.folder]);

  const noImages = listing != null && listing.path === draft.folder && listing.direct_image_count === 0 && listing.folders.length === 0;
  const what = templateSummary(draft, detectors);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4" role="presentation" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-title"
        className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-base-800 p-5 shadow-soft"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (canScan) onScan(draft);
        }}
      >
        <div>
          <h2 id="scan-title" className="font-display text-subheading">
            {from ? "Scan again" : "New scan"}
          </h2>
          <p className="mt-1 text-caption text-text-secondary">
            {from ? `Filled from the scan of ${from}. Change what you need and run; the first scan stays in the list.` : "Pick a folder under the source root. Every check the curator has loaded runs unless turned off here."}
          </p>
        </div>
        <FolderPicker listing={listing} error={listingError} onOpen={(folder) => setDraft((current) => ({ ...current, folder }))} />
        <PolicyPicker available={detectors?.singguard_policies ?? []} choice={draft.policy} disabled={false} onChange={(policy) => setDraft((current) => ({ ...current, policy }))} />
        <ScanChecks
          detectors={detectors}
          health={health}
          withGarments={draft.withGarments}
          setAge={draft.setAge}
          disabled={false}
          onWithGarments={(withGarments) => setDraft((current) => ({ ...current, withGarments }))}
          onSetAge={(setAge) => setDraft((current) => ({ ...current, setAge }))}
        />
        {noImages ? <p className="text-caption text-warning">This folder has no images and no subfolders.</p> : null}
        {busyLabel ? <p className="text-caption text-text-muted">{busyLabel}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="rounded-md bg-interactive px-3 py-1.5 text-small font-medium disabled:opacity-40" disabled={!canScan}>
            Scan {listing?.path || "source root"}
          </button>
          <button type="button" className="rounded-md border border-base-600 px-3 py-1.5 text-small" onClick={onClose}>
            Cancel
          </button>
          {what ? <span className="text-caption text-text-muted">{what}</span> : null}
        </div>
      </form>
    </div>
  );
}
