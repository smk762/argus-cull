"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { exportScan, getDetectors, getFolders, getHealth, getScan, scanFolder, selectScan } from "@/lib/api";
import { downloadText } from "@/lib/download";
import { exportedAbsPathList, keptPathList, selectionJsonl } from "@/lib/paths";
import { isSensitive } from "@/lib/moderation";
import { availability, selectBody } from "@/lib/select";
import {
  PAGE_SIZE,
  type Detectors,
  type ExportMode,
  type ExportResult,
  type FolderListing,
  type Health,
  type Progress,
  type ScanSummary,
  type SelectResult,
} from "@/lib/types";
import { withFilter } from "@/lib/urlState";
import { currentSearch, replaceView, serverSearch, subscribeUrl, viewFromSearch } from "@/lib/urlStore";

import { ExportDialog } from "./ExportDialog";
import { Filters } from "./Filters";
import { FolderPicker } from "./FolderPicker";
import { People } from "./People";
import { PhotoDialog } from "./PhotoDialog";
import { PhotoGrid } from "./PhotoGrid";

const LIGHTBOX_URL = "https://github.com/smk762/argus-lightbox";

function subscribeHydration(): () => void {
  return () => {};
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function CullApp() {
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const search = useSyncExternalStore(subscribeUrl, currentSearch, serverSearch);
  const view = useMemo(() => viewFromSearch(search), [search]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [detectors, setDetectors] = useState<Detectors | null>(null);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [listingError, setListingError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [selection, setSelection] = useState<SelectResult | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<Progress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancel = false;
    async function loadStatus() {
      try {
        const body = await getHealth();
        if (cancel) return;
        setHealth((current) => (sameJson(current, body) ? current : body));
        setHealthError(null);
      } catch (err: unknown) {
        if (cancel) return;
        setHealth(null);
        setHealthError(err instanceof Error ? err.message : "Curator is not reachable.");
      }
      try {
        const body = await getDetectors();
        if (!cancel) setDetectors((current) => (sameJson(current, body) ? current : body));
      } catch {
        if (!cancel) setDetectors(null);
      }
    }
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 8000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [hydrated]);

  const sourceReady = health?.status === "ok" && Boolean(health.source_root);

  useEffect(() => {
    if (!hydrated || !sourceReady) return;
    let cancel = false;
    getFolders(view.folder)
      .then((body) => {
        if (cancel) return;
        setListing(body);
        setListingError(null);
      })
      .catch((err: unknown) => {
        if (cancel) return;
        setListingError(err instanceof Error ? err.message : "Could not list folders.");
      });
    return () => {
      cancel = true;
    };
  }, [hydrated, sourceReady, view.folder]);

  useEffect(() => {
    if (!hydrated || !view.scan || summary?.scan_id === view.scan) return;
    let cancel = false;
    getScan(view.scan)
      .then((body) => {
        if (cancel) return;
        setSummary(body);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "Could not load that scan.");
      });
    return () => {
      cancel = true;
    };
  }, [hydrated, view.scan, summary?.scan_id]);

  const gates = useMemo(() => availability(detectors, summary), [detectors, summary]);

  useEffect(() => {
    if (!summary || !detectors) return;
    let cancel = false;
    selectScan(summary.scan_id, selectBody(view.filter, availability(detectors, summary)))
      .then((body) => {
        if (cancel) return;
        setSelection(body);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "Could not apply the filter.");
      });
    return () => {
      cancel = true;
    };
  }, [summary, detectors, view.filter]);

  const reasons = useMemo(() => {
    if (!selection || selection.scan_id !== summary?.scan_id) return null;
    return new Map(selection.rows.map((row) => [row.rel_path, row.keep_reason]));
  }, [selection, summary?.scan_id]);

  const visible = useMemo(() => {
    const results = summary?.results ?? [];
    if (view.view === "people" && view.cluster) {
      return results.filter((image) => image.primary_face_cluster === view.cluster);
    }
    if (view.view === "people") return [];
    return results;
  }, [summary, view.view, view.cluster]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE) || 1);
  const page = Math.min(view.page, pages);

  const canScan = sourceReady && !scanning;

  const onScan = useCallback(async () => {
    if (!sourceReady || scanning) return;
    setScanning(true);
    setError(null);
    setProgress({ phase: "starting", done: 0, total: 0 });
    setSelection(null);
    try {
      const live = await getDetectors();
      setDetectors(live);
      const next = await scanFolder(view.folder, live, setProgress);
      setSummary(next);
      replaceView({ ...view, scan: next.scan_id, page: 1, photo: null });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }, [sourceReady, scanning, view]);

  const photo = summary?.results.find((image) => image.rel_path === view.photo) ?? null;
  const sensitive = useMemo(() => {
    const flagged = new Set<string>();
    for (const image of summary?.results ?? []) {
      if (isSensitive(image)) flagged.add(image.rel_path);
    }
    return flagged;
  }, [summary]);
  const peopleEnabled = gates.faces || (summary?.face_clusters.length ?? 0) > 0;

  function downloadPaths() {
    if (!selection) return;
    downloadText("paths.txt", keptPathList(selection.rows), "text/plain");
    window.setTimeout(() => {
      downloadText("paths.jsonl", selectionJsonl(selection.rows), "application/x-ndjson");
    }, 150);
  }

  async function onExport(dest: string, mode: ExportMode) {
    if (!summary) return;
    setExporting(true);
    setExportError(null);
    setExportProgress(null);
    try {
      const result = await exportScan(summary.scan_id, dest, mode, selectBody(view.filter, gates), setExportProgress);
      setExportResult(result);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[22rem_1fr]">
      <aside className="space-y-6 overflow-y-auto border-base-700 p-4 lg:max-h-dvh lg:border-r">
        <div>
          <p className="font-display text-heading">Argus Cull</p>
          <p className="text-caption text-text-secondary">Which files would make the training set.</p>
        </div>
        <p className="text-caption" role="status">
          {healthError ? <span className="text-error">{healthError}. Scan stays off until the curator answers.</span> : null}
          {health?.status === "ok" ? (
            <span className="text-success">
              Curator{health.version ? ` ${health.version}` : ""} is up{health.allow_move ? " · move allowed" : " · move refused"}.
            </span>
          ) : null}
          {health && !health.source_root ? <span className="text-warning"> No source root is configured.</span> : null}
        </p>
        <FolderPicker
          listing={listing}
          error={listingError}
          scanning={scanning}
          canScan={canScan}
          onOpen={(folder) => replaceView({ ...view, folder })}
          onScan={() => void onScan()}
        />
        <Filters
          filter={view.filter}
          detectors={detectors}
          summary={summary}
          gates={gates}
          onChange={(patch) => replaceView(withFilter(view, patch))}
        />
      </aside>
      <main className="space-y-4 overflow-y-auto p-4 lg:max-h-dvh">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-small text-text-secondary">
              {selection ? `${selection.kept} of ${selection.total} kept` : summary ? `${summary.total} images` : "No scan yet"}
            </p>
            {progress ? (
              <p className="text-caption text-text-muted">
                {progress.phase} {progress.done}/{progress.total}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-md border px-3 py-1.5 text-small ${view.view === "grid" ? "border-accent-primary" : "border-base-600"}`}
              onClick={() => replaceView({ ...view, view: "grid", page: 1 })}
            >
              Grid
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-1.5 text-small disabled:opacity-40 ${view.view === "people" ? "border-accent-primary" : "border-base-600"}`}
              disabled={!peopleEnabled}
              onClick={() => replaceView({ ...view, view: "people", page: 1 })}
            >
              People
            </button>
            <button type="button" className="rounded-md border border-base-600 px-3 py-1.5 text-small disabled:opacity-40" disabled={!selection} onClick={downloadPaths}>
              Download paths
            </button>
            <button
              type="button"
              className="rounded-md bg-interactive px-3 py-1.5 text-small font-medium disabled:opacity-40"
              disabled={!selection}
              onClick={() => {
                setExportResult(null);
                setExportError(null);
                setExportProgress(null);
                setExportOpen(true);
              }}
            >
              Export
            </button>
          </div>
        </header>
        {error ? <p className="text-small text-error">{error}</p> : null}
        {!summary && !scanning ? (
          <p className="text-text-secondary">
            Pick a folder under the source root and scan it. Rejected images stay in the grid and say why they were left out.
          </p>
        ) : null}
        {summary && summary.total === 0 ? <p className="text-text-secondary">This folder has no images the curator can read.</p> : null}
        {view.view === "people" && summary ? (
          <People
            clusters={summary.face_clusters}
            scanId={summary.scan_id}
            active={view.cluster}
            sensitive={sensitive}
            onOpen={(cluster) => replaceView(withFilter({ ...view, view: "people", cluster }, { faceClusters: [cluster] }))}
            onClear={() => replaceView(withFilter({ ...view, cluster: null }, { faceClusters: [] }))}
          />
        ) : null}
        {summary && view.view === "grid" ? (
          <PhotoGrid
            images={visible}
            reasons={reasons}
            scanId={summary.scan_id}
            page={page}
            onPage={(nextPage) => replaceView({ ...view, page: nextPage })}
            onOpen={(relPath) => replaceView({ ...view, photo: relPath })}
          />
        ) : null}
        {summary && view.view === "people" && view.cluster ? (
          <PhotoGrid
            images={visible}
            reasons={reasons}
            scanId={summary.scan_id}
            page={page}
            onPage={(nextPage) => replaceView({ ...view, page: nextPage })}
            onOpen={(relPath) => replaceView({ ...view, photo: relPath })}
          />
        ) : null}
        <p className="text-caption text-text-muted">
          Captions and compare live in{" "}
          <a className="text-accent-tertiary hover:underline" href={LIGHTBOX_URL}>
            lightbox
          </a>
          . This demo does not train, geotag, or write names back into the photo folder.
        </p>
      </main>
      {photo && summary ? (
        <PhotoDialog
          key={photo.rel_path}
          image={photo}
          scanId={summary.scan_id}
          reason={reasons?.get(photo.rel_path)}
          onClose={() => replaceView({ ...view, photo: null })}
        />
      ) : null}
      {exportOpen ? (
        <ExportDialog
          allowMove={Boolean(health?.allow_move)}
          busy={exporting}
          progress={exportProgress}
          error={exportError}
          result={exportResult}
          onClose={() => setExportOpen(false)}
          onExport={(dest, mode) => void onExport(dest, mode)}
          onDownloadExported={() => {
            if (exportResult) downloadText("exported-abs-paths.txt", exportedAbsPathList(exportResult), "text/plain");
          }}
        />
      ) : null}
    </div>
  );
}
