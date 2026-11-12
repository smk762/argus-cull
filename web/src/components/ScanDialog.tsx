"use client";

import { useEffect, useRef, useState } from "react";

import { getFolders } from "@/lib/api";
import { templateFromRunStats, templateSummary, type ScanTemplate } from "@/lib/scanTemplate";
import type { Detectors, FolderListing, GuardPolicyInfo, Health } from "@/lib/types";

import { FolderPicker } from "./FolderPicker";
import { closeModal, Modal } from "./Modal";
import { PolicyPicker } from "./PolicyPicker";
import { ScanChecks } from "./ScanChecks";
import { Info } from "./Tooltip";

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
  root = null,
  policies = null,
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
  /** The curator's source root, to read an imported run's folder against. */
  root?: string | null;
  /** Curator 0.8: wording of each named policy, for the form. */
  policies?: readonly GuardPolicyInfo[] | null;
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
  const fileInput = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<{ name: string; notes: string[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function importRun(file: File) {
    setImportError(null);
    try {
      const { template, notes } = templateFromRunStats(JSON.parse(await file.text()), root, detectors);
      setDraft(template);
      setImported({ name: file.name, notes });
    } catch (err: unknown) {
      setImported(null);
      setImportError(err instanceof SyntaxError ? `${file.name} is not JSON.` : err instanceof Error ? err.message : "Could not read that file.");
    }
  }

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
    <Modal labelledBy="scan-title" className="max-w-lg p-5" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canScan) onScan(draft);
        }}
      >
        <div>
          <div className="flex items-start justify-between gap-3">
            <h2 id="scan-title" className="font-display text-subheading">
              {from ? "Scan again" : "New scan"}
            </h2>
            <span className="flex items-center gap-1.5">
              <button type="button" className="rounded-md border border-base-600 px-2 py-1 text-small" onClick={() => fileInput.current?.click()}>
                Import run…
              </button>
              <Info text="Fill the form from a Run stats file (run-stats-*.json): its folder, policies, and the garments, set-age and body checks. A file saved with policies switched off fills in only the ones left on." />
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importRun(file);
                }}
              />
            </span>
          </div>
          <p className="mt-1 text-caption text-text-secondary">
            {from ? `Filled from the scan of ${from}. Change what you need and run; the first scan stays in the list.` : "Pick a folder under the source root. Every check the curator has loaded runs unless turned off here."}
          </p>
        </div>
        {importError ? <p className="text-caption text-error">{importError}</p> : null}
        {imported ? (
          <div className="rounded-md border border-base-600 p-2 text-caption text-text-secondary">
            <p>Filled from {imported.name}.</p>
            {imported.notes.map((note) => (
              <p key={note} className="text-warning">
                {note}
              </p>
            ))}
          </div>
        ) : null}
        <FolderPicker listing={listing} error={listingError} onOpen={(folder) => setDraft((current) => ({ ...current, folder }))} />
        <PolicyPicker available={detectors?.singguard_policies ?? []} choice={draft.policy} catalog={policies} disabled={false} onChange={(policy) => setDraft((current) => ({ ...current, policy }))} />
        <ScanChecks
          detectors={detectors}
          health={health}
          withGarments={draft.withGarments}
          setAge={draft.setAge}
          readBodies={draft.readBodies}
          drops={draft.drops}
          cropWatermarks={draft.cropWatermarks}
          cropMaxCut={draft.cropMaxCut}
          disabled={false}
          onWithGarments={(withGarments) => setDraft((current) => ({ ...current, withGarments }))}
          onSetAge={(setAge) => setDraft((current) => ({ ...current, setAge }))}
          onReadBodies={(readBodies) => setDraft((current) => ({ ...current, readBodies }))}
          onDrops={(drops) => setDraft((current) => ({ ...current, drops }))}
          onCropWatermarks={(cropWatermarks) => setDraft((current) => ({ ...current, cropWatermarks }))}
          onCropMaxCut={(cropMaxCut) => setDraft((current) => ({ ...current, cropMaxCut }))}
        />
        {noImages ? <p className="text-caption text-warning">This folder has no images and no subfolders.</p> : null}
        {busyLabel ? <p className="text-caption text-text-muted">{busyLabel}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="rounded-md bg-interactive px-3 py-1.5 text-small font-medium disabled:opacity-40" disabled={!canScan}>
            Scan {listing?.path || "source root"}
          </button>
          <button type="button" className="rounded-md border border-base-600 px-3 py-1.5 text-small" onClick={closeModal}>
            Cancel
          </button>
          {what ? <span className="text-caption text-text-muted">{what}</span> : null}
        </div>
      </form>
    </Modal>
  );
}
