"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { deleteImages, exportScan, getDetectors, getFolders, getHealth, getScan, getScans, scanFolder, selectScan } from "@/lib/api";
import { DEFAULT_BLUR, filterByAge, filterByKeep, filterByRace, isMinorExposed, mergeChunk, shouldBlur, sortImages, type BlurPolicy, type GridSort, type KeepView, type SortDirection } from "@/lib/chunks";
import { downloadText } from "@/lib/download";
import { exportedAbsPathList, keptPathList, selectionJsonl } from "@/lib/paths";
import { availability, selectBody } from "@/lib/select";
import { evaluateSubset } from "@/lib/subset";
import {
  PAGE_SIZE,
  type Detectors,
  type ExportMode,
  type FaceRace,
  type ExportResult,
  type FolderListing,
  type Health,
  type Progress,
  type ScanList,
  type ScanSummary,
  type SelectResult,
} from "@/lib/types";
import { withoutScan } from "@/lib/purge";
import { withFilter } from "@/lib/urlState";
import { currentSearch, replaceView, serverSearch, subscribeUrl, viewFromSearch } from "@/lib/urlStore";

import { ExportDialog } from "./ExportDialog";
import { SubsetDialog } from "./SubsetDialog";
import { Filters } from "./Filters";
import { FolderPicker } from "./FolderPicker";
import { People } from "./People";
import { PhotoDialog } from "./PhotoDialog";
import { PhotoGrid } from "./PhotoGrid";
import { ProgressBar } from "./ProgressBar";
import { ScanList as ScanListView } from "./ScanList";

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
  const [scanList, setScanList] = useState<ScanList | null>(null);
  const [pendingChecks, setPendingChecks] = useState<string[]>([]);
  const [blur, setBlur] = useState<BlurPolicy>(DEFAULT_BLUR);
  const [unblurNsfw, setUnblurNsfw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<Progress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/display")
      .then((response) => response.json())
      .then((body: BlurPolicy) => {
        if (!cancel && typeof body.exposedScore === "number") setBlur(body);
      })
      .catch(() => {
        // The defaults still lift the blur at 0.25 and re-apply it on a policy issue.
      });
    return () => {
      cancel = true;
    };
  }, []);

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
  const seenFolder = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (seenFolder.current === null) {
      seenFolder.current = view.folder;
      return;
    }
    if (seenFolder.current === view.folder) return;
    seenFolder.current = view.folder;
    setSummary(null);
    setSelection(null);
    setExportOpen(false);
    setExportResult(null);
    setExportError(null);
  }, [hydrated, view.folder]);

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
    if (!hydrated || !sourceReady) return;
    let cancel = false;
    const load = () => {
      getScans()
        .then((body) => {
          if (!cancel && body) setScanList(body);
        })
        .catch(() => {
          // The list is an aid. A curator that predates it leaves the page usable.
        });
    };
    load();
    const timer = window.setInterval(load, 2000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [hydrated, sourceReady]);

  useEffect(() => {
    if (!hydrated || scanning || !view.scan || summary?.scan_id === view.scan) return;
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
  }, [hydrated, scanning, view.scan, summary?.scan_id]);

  const activeScanId = scanList?.active?.scan_id ?? null;
  useEffect(() => {
    if (!activeScanId || scanning || view.scan !== activeScanId) return;
    let cancel = false;
    const refresh = () => {
      getScan(activeScanId)
        .then((body) => {
          if (!cancel) setSummary(body);
        })
        .catch(() => {
          // The first batches may not be on disk yet.
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [activeScanId, scanning, view.scan]);

  const gates = useMemo(() => availability(detectors, summary), [detectors, summary]);

  useEffect(() => {
    if (!summary || !detectors || scanning) return;
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
  }, [summary, detectors, view.filter, scanning]);

  const reasons = useMemo(() => {
    if (!selection || selection.scan_id !== summary?.scan_id) return null;
    return new Map(selection.rows.map((row) => [row.rel_path, row.keep_reason]));
  }, [selection, summary?.scan_id]);

  const [sort, setSort] = useState<GridSort>("scanned");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [ageFrom, setAgeFrom] = useState<number | null>(null);
  const [ageTo, setAgeTo] = useState<number | null>(null);
  const [race, setRace] = useState<FaceRace | null>(null);
  const [keepView, setKeepView] = useState<KeepView>("all");
  const [subsetOpen, setSubsetOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const results = summary?.results ?? [];
    if (view.view === "people" && view.cluster) {
      return results.filter((image) => image.primary_face_cluster === view.cluster);
    }
    if (view.view === "people") return [];
    return results;
  }, [summary, view.view, view.cluster]);
  const viewed = useMemo(() => filterByRace(filterByAge(visible, ageFrom, ageTo), race), [visible, ageFrom, ageTo, race]);
  const gallery = useMemo(() => sortImages(filterByKeep(viewed, reasons, keepView), sort, sortDirection), [viewed, reasons, keepView, sort, sortDirection]);
  const keepCounts = useMemo(() => {
    if (!reasons) return null;
    let kept = 0;
    for (const image of viewed) if (reasons.get(image.rel_path) === "") kept += 1;
    return { kept, leftOut: viewed.length - kept };
  }, [viewed, reasons]);
  const subset = useMemo(() => (summary && reasons ? evaluateSubset(summary, reasons, view.filter.minScore) : null), [summary, reasons, view.filter.minScore]);
  const displayBlur = useMemo(() => ({ ...blur, unblurNsfw }), [blur, unblurNsfw]);
  const flagged = useMemo(() => gallery.filter((image) => isMinorExposed(image)).map((image) => image.rel_path), [gallery]);

  const pages = Math.max(1, Math.ceil(gallery.length / PAGE_SIZE) || 1);
  const page = Math.min(view.page, pages);

  const scanBusy = scanning || Boolean(scanList?.active);
  const canScan = sourceReady && !scanBusy;

  const onScan = useCallback(async () => {
    if (!sourceReady || scanning || scanList?.active) return;
    setScanning(true);
    setError(null);
    setProgress({ phase: "starting", done: 0, total: 0 });
    setPendingChecks([]);
    setSelection(null);
    setSummary(null);
    let announced = false;
    try {
      const live = await getDetectors();
      setDetectors(live);
      const next = await scanFolder(
        view.folder,
        live,
        setProgress,
        (chunk) => {
          setProgress({ phase: chunk.phase, done: chunk.done, total: chunk.total });
          setPendingChecks(chunk.pending_checks ?? []);
          setSummary((current) => mergeChunk(current, chunk));
          if (!announced) {
            announced = true;
            // Filters may have changed since the click, so read the view back from the URL.
            replaceView({ ...viewFromSearch(currentSearch()), scan: chunk.scan_id, page: 1, photo: null });
            void getScans().then((body) => {
              if (body) setScanList(body);
            });
          }
        },
      );
      setSummary(next);
      setPendingChecks([]);
      // Keep the page the user reached while batches were streaming in.
      const current = viewFromSearch(currentSearch());
      replaceView({ ...current, scan: next.scan_id, page: announced ? current.page : 1, photo: announced ? current.photo : null });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
      setProgress(null);
      void getScans().then((body) => {
        if (body) setScanList(body);
      });
    }
  }, [sourceReady, scanning, scanList?.active, view]);

  const photo = summary?.results.find((image) => image.rel_path === view.photo) ?? null;
  const photoIndex = photo ? gallery.findIndex((image) => image.rel_path === photo.rel_path) : -1;
  const previousPhoto = photoIndex > 0 ? gallery[photoIndex - 1] : null;
  const nextPhoto = photoIndex >= 0 && photoIndex < gallery.length - 1 ? gallery[photoIndex + 1] : null;

  function openPhoto(relPath: string) {
    const index = gallery.findIndex((image) => image.rel_path === relPath);
    replaceView({ ...view, photo: relPath, page: index >= 0 ? Math.floor(index / PAGE_SIZE) + 1 : view.page });
  }

  function dropDeleted(scanId: string, paths: string[]) {
    const gone = new Set(paths);
    setSummary((current) => {
      if (!current || current.scan_id !== scanId) return current;
      const results = current.results.filter((item) => !gone.has(item.rel_path));
      return { ...current, results, total: results.length };
    });
    setSelected((prev) => {
      const next = new Set([...prev].filter((rel) => !gone.has(rel)));
      return next.size === prev.size ? prev : next;
    });
    if (view.photo && gone.has(view.photo)) replaceView({ ...viewFromSearch(currentSearch()), photo: null });
  }

  function toggleSelected(relPath: string) {
    setDeleteConfirm(false);
    setBatchError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  }

  function selectAll() {
    setDeleteConfirm(false);
    setBatchError(null);
    const paths = gallery.map((image) => image.rel_path);
    setSelected((prev) => {
      if (paths.every((rel) => prev.has(rel))) {
        const next = new Set(prev);
        for (const rel of paths) next.delete(rel);
        return next;
      }
      const next = new Set(prev);
      for (const rel of paths) next.add(rel);
      return next;
    });
  }

  function selectFlagged() {
    setDeleteConfirm(false);
    setBatchError(null);
    setSelected((prev) => (flagged.every((rel) => prev.has(rel)) ? new Set() : new Set(flagged)));
  }

  async function deleteSelected() {
    if (!summary) return;
    const paths = flagged.filter((rel) => selected.has(rel));
    if (paths.length === 0) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setBatchDeleting(true);
    setBatchError(null);
    try {
      await deleteImages(summary.scan_id, paths);
      dropDeleted(summary.scan_id, paths);
      setDeleteConfirm(false);
    } catch (err: unknown) {
      setBatchError(err instanceof Error ? err.message : "Could not delete the selected files.");
      setDeleteConfirm(false);
    } finally {
      setBatchDeleting(false);
    }
  }

  function changeGallery(patch: { sort?: GridSort; direction?: SortDirection; ageFrom?: number | null; ageTo?: number | null; race?: FaceRace | null }) {
    if (patch.sort != null) setSort(patch.sort);
    if (patch.direction != null) setSortDirection(patch.direction);
    if ("ageFrom" in patch) setAgeFrom(patch.ageFrom ?? null);
    if ("ageTo" in patch) setAgeTo(patch.ageTo ?? null);
    if ("race" in patch) setRace(patch.race ?? null);
    if (view.page !== 1) replaceView({ ...view, page: 1 });
  }
  const pending = useMemo(() => {
    if (scanning) return pendingChecks;
    if (scanList?.active && scanList.active.scan_id === summary?.scan_id) return scanList.active.pending_checks;
    return [];
  }, [scanning, pendingChecks, scanList?.active, summary?.scan_id]);
  const sensitive = useMemo(() => {
    const flagged = new Set<string>();
    for (const image of summary?.results ?? []) {
      if (shouldBlur(image, pending, displayBlur)) flagged.add(image.rel_path);
    }
    return flagged;
  }, [summary, pending, displayBlur]);
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
          scanning={scanBusy}
          canScan={canScan}
          scanLabel={scanning ? "Scanning…" : scanList?.active ? "Scan in progress" : "Scan"}
          onOpen={(folder) => replaceView(withoutScan(view, folder))}
          onScan={() => void onScan()}
        />
        <ScanListView
          scans={scanList}
          root={health?.source_root ?? null}
          current={view.scan}
          onOpen={(scanId, folder) => replaceView({ ...withoutScan(view, folder), scan: scanId })}
        />
        <Filters
          filter={view.filter}
          detectors={detectors}
          summary={summary}
          gates={gates}
          onChange={(patch) => replaceView(withFilter(view, patch))}
          unblurNsfw={unblurNsfw}
          onUnblurNsfw={setUnblurNsfw}
        />
      </aside>
      <main className="space-y-4 overflow-y-auto p-4 lg:max-h-dvh">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-text-secondary">
            {scanning || (scanList?.active && (!summary || summary.scan_id === scanList.active.scan_id))
              ? summary && summary.results.length > 0
                ? `${summary.results.length} of ${summary.total} images`
                : "Scanning"
              : selection
                ? `${selection.kept} of ${selection.total} kept`
                : summary
                  ? `${summary.total} images`
                  : "No scan yet"}
          </p>
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
            <button type="button" className="rounded-md border border-base-600 px-3 py-1.5 text-small disabled:opacity-40" disabled={!subset} onClick={() => setSubsetOpen(true)}>
              Evaluate keep set
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
          </div>
          {progress ? (
            <ProgressBar progress={progress} />
          ) : scanList?.active && (!summary || summary.scan_id === scanList.active.scan_id) ? (
            <ProgressBar progress={scanList.active} />
          ) : null}
        </header>
        {error ? <p className="text-small text-error">{error}</p> : null}
        {!summary && !scanning && !scanList?.active ? (
          <p className="text-text-secondary">
            Pick a folder under the source root and scan it. Rejected images stay in the grid and say why they were left out.
          </p>
        ) : null}
        {!summary && (scanning || scanList?.active) ? (
          <p className="text-text-secondary">Images appear here as each batch finishes.</p>
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
            images={gallery}
            reasons={reasons}
            scanId={summary.scan_id}
            page={page}
            pending={pending}
            blur={displayBlur}
            sort={sort}
            direction={sortDirection}
            ageFrom={ageFrom}
            ageTo={ageTo}
            unfilteredCount={visible.length}
            onSort={(next) => changeGallery({ sort: next })}
            onDirection={(next) => changeGallery({ direction: next })}
            onAge={(from, to) => changeGallery({ ageFrom: from, ageTo: to })}
            race={race}
            onRace={(next) => changeGallery({ race: next })}
            keepView={keepView}
            keptCount={keepCounts?.kept ?? null}
            leftOutCount={keepCounts?.leftOut ?? null}
            onKeepView={(next) => {
              setKeepView(next);
              if (view.page !== 1) replaceView({ ...view, page: 1 });
            }}
            onPage={(nextPage) => replaceView({ ...view, page: nextPage })}
            onOpen={openPhoto}
            selected={selected}
            onToggleSelected={toggleSelected}
            onSelectAll={selectAll}
            onSelectFlagged={selectFlagged}
            onDeleteSelected={() => void deleteSelected()}
            deleteConfirm={deleteConfirm}
            deleting={batchDeleting}
            deleteError={batchError}
          />
        ) : null}
        {summary && view.view === "people" && view.cluster ? (
          <PhotoGrid
            images={gallery}
            reasons={reasons}
            scanId={summary.scan_id}
            page={page}
            pending={pending}
            blur={displayBlur}
            sort={sort}
            direction={sortDirection}
            ageFrom={ageFrom}
            ageTo={ageTo}
            unfilteredCount={visible.length}
            onSort={(next) => changeGallery({ sort: next })}
            onDirection={(next) => changeGallery({ direction: next })}
            onAge={(from, to) => changeGallery({ ageFrom: from, ageTo: to })}
            race={race}
            onRace={(next) => changeGallery({ race: next })}
            keepView={keepView}
            keptCount={keepCounts?.kept ?? null}
            leftOutCount={keepCounts?.leftOut ?? null}
            onKeepView={(next) => {
              setKeepView(next);
              if (view.page !== 1) replaceView({ ...view, page: 1 });
            }}
            onPage={(nextPage) => replaceView({ ...view, page: nextPage })}
            onOpen={openPhoto}
            selected={selected}
            onToggleSelected={toggleSelected}
            onSelectAll={selectAll}
            onSelectFlagged={selectFlagged}
            onDeleteSelected={() => void deleteSelected()}
            deleteConfirm={deleteConfirm}
            deleting={batchDeleting}
            deleteError={batchError}
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
          pending={pending}
          blur={displayBlur}
          onClose={() => replaceView({ ...view, photo: null })}
          onPrevious={previousPhoto ? () => openPhoto(previousPhoto.rel_path) : null}
          onNext={nextPhoto ? () => openPhoto(nextPhoto.rel_path) : null}
          position={photoIndex >= 0 ? `${photoIndex + 1} of ${gallery.length}` : null}
          onDelete={async () => {
            if (!summary || !photo) return;
            const scanId = summary.scan_id;
            const rel = photo.rel_path;
            await deleteImages(scanId, [rel]);
            dropDeleted(scanId, [rel]);
          }}
        />
      ) : null}
      {subsetOpen && subset ? <SubsetDialog report={subset} onClose={() => setSubsetOpen(false)} /> : null}
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
