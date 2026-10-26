"use client";

import { attributeLine } from "@/lib/attributes";
import { thumbUrl } from "@/lib/api";
import type { FaceCluster } from "@/lib/types";

export function People({
  clusters,
  scanId,
  active,
  sensitive,
  onOpen,
  onClear,
}: {
  clusters: FaceCluster[];
  scanId: string;
  active: string | null;
  sensitive: ReadonlySet<string>;
  onOpen: (clusterId: string) => void;
  onClear: () => void;
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
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {clusters.map((cluster) => {
          const attrs = attributeLine(cluster.attributes);
          const selected = cluster.cluster_id === active;
          return (
            <li key={cluster.cluster_id}>
              <button
                type="button"
                className={`w-full overflow-hidden rounded-lg border bg-base-800 text-left ${selected ? "border-accent-primary" : "border-base-700"}`}
                onClick={() => onOpen(cluster.cluster_id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl(scanId, cluster.representative_rel_path)}
                  alt=""
                  className={`aspect-square w-full object-cover ${sensitive.has(cluster.representative_rel_path) ? "scale-110 blur-2xl" : ""}`}
                />
                <span className="block space-y-1 p-2">
                  <span className="block font-medium">{cluster.cluster_id}</span>
                  <span className="block text-caption text-text-secondary">{cluster.size} faces</span>
                  {attrs ? <span className="block truncate text-caption text-text-muted">{attrs}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
