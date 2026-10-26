"use client";

import { attributeLine } from "@/lib/attributes";
import { thumbUrl } from "@/lib/api";
import { isSensitive } from "@/lib/moderation";
import { PAGE_SIZE, type ImageResult } from "@/lib/types";

export function PhotoGrid({
  images,
  reasons,
  scanId,
  page,
  onPage,
  onOpen,
}: {
  images: ImageResult[];
  reasons: Map<string, string> | null;
  scanId: string;
  page: number;
  onPage: (page: number) => void;
  onOpen: (relPath: string) => void;
}) {
  const pages = Math.max(1, Math.ceil(images.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const slice = images.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  if (images.length === 0) {
    return <p className="text-text-secondary">Nothing in this view.</p>;
  }

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {slice.map((image) => {
          const reason = reasons?.get(image.rel_path);
          const attrs = attributeLine(image.primary_face_attributes);
          const kept = reason === "";
          const blurred = isSensitive(image);
          return (
            <li key={image.rel_path}>
              <button
                type="button"
                className="w-full overflow-hidden rounded-lg border border-base-700 bg-base-800 text-left hover:border-accent-primary"
                onClick={() => onOpen(image.rel_path)}
              >
                {/* Thumbnails are already resized by the curator. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl(scanId, image.rel_path)}
                  alt=""
                  className={`aspect-square w-full object-cover ${blurred ? "scale-110 blur-2xl" : ""}`}
                />
                <span className="block space-y-1 p-2">
                  <span className="block truncate text-caption text-text-secondary">{image.rel_path}</span>
                  <span className="block text-caption text-text-muted">{image.score.toFixed(2)}</span>
                  {blurred ? <span className="block text-caption text-text-muted">Blurred</span> : null}
                  {reasons ? (
                    <span className={`block text-caption ${kept ? "text-success" : "text-warning"}`}>{kept ? "keep" : reason}</span>
                  ) : (
                    <span className="block text-caption text-text-muted">Selecting…</span>
                  )}
                  {attrs ? <span className="block truncate text-caption text-text-muted">{attrs}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 text-small">
        <button type="button" className="rounded-md border border-base-600 px-3 py-1 disabled:opacity-40" disabled={current <= 1} onClick={() => onPage(current - 1)}>
          Previous
        </button>
        <span className="text-text-secondary">
          Page {current} of {pages}
        </span>
        <button type="button" className="rounded-md border border-base-600 px-3 py-1 disabled:opacity-40" disabled={current >= pages} onClick={() => onPage(current + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
