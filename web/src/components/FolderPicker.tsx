"use client";

import type { FolderListing } from "@/lib/types";

export function FolderPicker({
  listing,
  error,
  scanning,
  canScan,
  scanLabel,
  onOpen,
  onScan,
  adultPolicy,
  onAdultPolicy,
}: {
  listing: FolderListing | null;
  error: string | null;
  scanning: boolean;
  canScan: boolean;
  scanLabel: string;
  onOpen: (path: string) => void;
  onScan: () => void;
  /** Whether the next scan uses SingGuard's adult policy; null when the server does not offer it. */
  adultPolicy: boolean | null;
  onAdultPolicy: (adult: boolean) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-small font-semibold">Folder</h2>
      {error ? <p className="text-caption text-error">{error}</p> : null}
      {listing ? (
        <>
          <p className="truncate text-caption text-text-secondary" title={listing.abs_path}>
            {listing.path || "source root"}
            {listing.direct_image_count > 0 ? ` · ${listing.direct_image_count} images here` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {listing.parent !== null ? (
              <button type="button" className="rounded-md border border-base-600 px-2 py-1 text-caption" onClick={() => onOpen(listing.parent ?? "")}>
                Up
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md bg-interactive px-3 py-1.5 text-small font-medium disabled:opacity-40"
              disabled={!canScan || scanning}
              onClick={onScan}
            >
              {scanLabel}
            </button>
          </div>
          {adultPolicy !== null ? (
            <label className="flex items-start gap-2 text-small">
              <input
                type="checkbox"
                className="mt-1"
                checked={adultPolicy}
                disabled={scanning}
                onChange={(event) => onAdultPolicy(event.target.checked)}
              />
              <span>
                Adult content allowed
                <span className="block text-caption text-text-muted">
                  SingGuard judges the next scan under the adult policy: consensual adult nudity passes, and apparent minors, non-consent and sexual violence are still rule A. NudeNet scores and blur do not change.
                </span>
              </span>
            </label>
          ) : null}
          <ul className="space-y-1">
            {listing.folders.map((folder) => (
              <li key={folder.rel_path}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1 text-left text-small hover:bg-base-700"
                  onClick={() => onOpen(folder.rel_path)}
                >
                  <span className="truncate">{folder.name}</span>
                  <span className="shrink-0 text-caption text-text-muted">{folder.image_count}</span>
                </button>
              </li>
            ))}
          </ul>
          {listing.folders.length === 0 ? <p className="text-caption text-text-muted">No subfolders.</p> : null}
        </>
      ) : (
        <p className="text-caption text-text-muted">Waiting for the folder list.</p>
      )}
    </section>
  );
}
