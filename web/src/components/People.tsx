"use client";

import { attributeLine } from "@/lib/attributes";
import { thumbUrl } from "@/lib/api";
import type { FaceCluster } from "@/lib/types";
import { clusterLabel } from "@/lib/urlState";

export function People({
  clusters,
  scanId,
  active,
  names,
  sensitive,
  onOpen,
  onClear,
  onName,
}: {
  clusters: FaceCluster[];
  scanId: string;
  active: string | null;
  names: Record<string, string>;
  sensitive: ReadonlySet<string>;
  onOpen: (clusterId: string) => void;
  onClear: () => void;
  onName: (clusterId: string, name: string) => void;
}) {
  if (clusters.length === 0) {
    return <p className="text-text-secondary">This scan has no face clusters.</p>;
  }
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-subheading">People</h2>
        {active ? (
          <button type="button" className="text-small text-accent-tertiary" onClick={onClear}>
            All clusters
          </button>
        ) : null}
      </div>
      <p className="text-caption text-text-muted">
        A name is written at export, as XMP person and region labels. Two clusters can share a name. The cached scan is not changed.
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {clusters.map((cluster) => {
          const attrs = attributeLine(cluster.attributes);
          const selected = cluster.cluster_id === active;
          const shown = clusterLabel(cluster.cluster_id, names);
          return (
            <li key={cluster.cluster_id} className={`overflow-hidden rounded-lg border bg-base-800 ${selected ? "border-accent-primary" : "border-base-700"}`}>
              <button type="button" className="w-full text-left" onClick={() => onOpen(cluster.cluster_id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl(scanId, cluster.representative_rel_path)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={`aspect-square w-full object-cover ${sensitive.has(cluster.representative_rel_path) ? "scale-110 blur-2xl" : ""}`}
                />
                <span className="block space-y-1 p-2 pb-0">
                  <span className="block font-medium">{shown}</span>
                  <span className="block text-caption text-text-secondary">
                    {cluster.size} faces{shown !== cluster.cluster_id ? ` · ${cluster.cluster_id}` : ""}
                  </span>
                  {attrs ? <span className="block truncate text-caption text-text-muted">{attrs}</span> : null}
                </span>
              </button>
              <label className="block p-2 pt-1 text-caption text-text-muted">
                Name
                <input
                  className="mt-1 w-full rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
                  value={names[cluster.cluster_id] ?? ""}
                  maxLength={200}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={cluster.cluster_id}
                  onChange={(event) => onName(cluster.cluster_id, event.target.value)}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
