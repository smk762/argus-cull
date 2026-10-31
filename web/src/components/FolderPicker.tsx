"use client";

import type { FolderListing } from "@/lib/types";

/** Browse the source root. The folder shown is the one the scan form will run. */
export function FolderPicker({ listing, error, onOpen }: { listing: FolderListing | null; error: string | null; onOpen: (path: string) => void }) {
  return (
    <section className="space-y-2">
      <h3 className="font-display text-small font-semibold">Folder</h3>
      {error ? <p className="text-caption text-error">{error}</p> : null}
      {listing ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-small text-text-primary" title={listing.abs_path}>
              {listing.path || "source root"}
              <span className="text-caption text-text-secondary">{listing.direct_image_count > 0 ? ` · ${listing.direct_image_count} images here` : " · no images here"}</span>
            </p>
            {listing.parent !== null ? (
              <button type="button" className="shrink-0 rounded-md border border-base-600 px-2 py-1 text-caption" onClick={() => onOpen(listing.parent ?? "")}>
                Up
              </button>
            ) : null}
          </div>
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-base-700 p-1">
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
            {listing.folders.length === 0 ? <li className="px-2 py-1 text-caption text-text-muted">No subfolders.</li> : null}
          </ul>
        </>
      ) : (
        <p className="text-caption text-text-muted">Waiting for the folder list.</p>
      )}
    </section>
  );
}
