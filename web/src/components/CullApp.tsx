"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { cancelScan, deleteImages, exportScan, getCaptions, getCohorts, getDetectors, getFolders, getHealth, getLabels, getScan, getScans, purgeScans, putLabel, scanFolder, ScanStopped, selectScan } from "@/lib/api";
import { DEFAULT_BLUR, facesRan, filterByAge, filterByFaces, filterByKeep, filterByRace, isMinorExposed, mergeChunk, shouldBlur, sortImages, type BlurPolicy, type FaceView, type GridSort, type KeepView, type SortDirection } from "@/lib/chunks";
import { autoTags, cohortStats, effectiveTags, EMPTY_COHORTS, filterByTag, type Caption, type CohortConfig } from "@/lib/cohorts";
import { downloadText } from "@/lib/download";
import { labelsJsonl, type ImageLabel } from "@/lib/labels";
import { exportedAbsPathList, keptPathList, selectionJsonl } from "@/lib/paths";
import { defaultPolicyChoice, policiesRun, policyStats, type PolicyChoice } from "@/lib/policies";
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
import { mergeProgress } from "@/lib/progress";
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
import { PolicyDialog } from "./PolicyDialog";
import { PolicyPicker } from "./PolicyPicker";
import { ProgressBar } from "./ProgressBar";
import { ScanChecks } from "./ScanChecks";
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
  const [labels, setLabels] = useState<Map<string, ImageLabel>>(() => new Map());
  const [labelsFolder, setLabelsFolder] = useState<string | null>(null);
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [cohorts, setCohorts] = useState<CohortConfig>(EMPTY_COHORTS);
  const [cohortError, setCohortError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Map<string, Caption | null>>(() => new Map());
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  // The policy choice lives in the URL, so a shared link scans the same way.
  const policyChoice = useMemo<PolicyChoice>(() => {
    const base = defaultPolicyChoice(detectors?.singguard_policies);
    return { policy: view.guardPolicy ?? base.policy, variants: view.guardVariants };
  }, [detectors?.singguard_policies, view.guardPolicy, view.guardVariants]);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [listingError, setListingError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [selection, setSelection] = useState<SelectResult | null>(null);
  const [progress, setProgress] = useState<Progress[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanList, setScanList] = useState<ScanList | null>(null);
  const [stopping, setStopping] = useState(false);
  const [purging, setPurging] = useState(false);
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
    getCohorts()
      .then((body) => {
        if (cancel) return;
        setCohorts({ scene_min_conf: body.scene_min_conf, tags: body.tags });
        setCohortError(body.error);
      })
      .catch((err: unknown) => {
        if (!cancel) setCohortError(err instanceof Error ? err.message : "Could not read cohorts.json.");
      });
    return () => {
      cancel = true;
    };
  }, [hydrated]);

  // Captions are only fetched when a rule reads them, for the images not asked about yet.
  const wantsCaptions = cohorts.tags.some((rule) => rule.captions.length > 0);
  const captionsAsked = useRef<Set<string>>(new Set());
  const resultPaths = summary?.results ?? [];
  useEffect(() => {
    if (!wantsCaptions || captionError) return;
    const missing = resultPaths.map((image) => image.abs_path).filter((abs) => !captionsAsked.current.has(abs));
    if (missing.length === 0) return;
    for (const abs of missing) captionsAsked.current.add(abs);
    let cancel = false;
    const batches: string[][] = [];
    for (let start = 0; start < missing.length; start += 400) batches.push(missing.slice(start, start + 400));
    const giveBack = (batch: string[]) => {
      for (const abs of batch) captionsAsked.current.delete(abs);
    };
    (async () => {
      for (const [index, batch] of batches.entries()) {
        try {
          const found = await getCaptions(batch);
          if (cancel) {
            giveBack(batch);
            batches.slice(index + 1).forEach(giveBack);
            return;
          }
          setCaptions((current) => {
            const next = new Map(current);
            for (const [abs, caption] of Object.entries(found)) next.set(abs, caption);
            return next;
          });
        } catch (err: unknown) {
          giveBack(batch);
          batches.slice(index + 1).forEach(giveBack);
          if (!cancel) setCaptionError(err instanceof Error ? err.message : "Could not read captions.");
          return;
        }
      }
    })();
    return () => {
      cancel = true;
    };
    // resultPaths is a new array each render; the length and scan are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsCaptions, captionError, summary?.scan_id, resultPaths.length]);

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

  // What the /scans poll below needs to know about the page, without restarting on every change.
  const latest = useRef({ scan: view.scan, scanning });
  useEffect(() => {
    latest.current = { scan: view.scan, scanning };
  }, [view.scan, scanning]);

  useEffect(() => {
    if (!hydrated || !sourceReady) return;
    let cancel = false;
    const load = () => {
      getScans()
        .then((body) => {
          if (cancel || !body) return;
          setScanList(body);
          // A scan stopped or purged from another tab is gone from the curator:
          // let go of it here too, instead of asking for it and showing "unknown scan_id".
          const { scan, scanning: busy } = latest.current;
          if (!scan || busy) return;
          const known = body.active?.scan_id === scan || body.scans.some((row) => row.scan_id === scan);
          if (known) return;
          setSummary(null);
          setSelection(null);
          setPendingChecks([]);
          replaceView(withoutScan(viewFromSearch(currentSearch())));
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
    selectScan(summary.scan_id, selectBody(view.filter, availability(detectors, summary), summary))
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
  const [faceView, setFaceView] = useState<FaceView>("all");
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
  // Automatic tags from scene and caption, then the tags that count once a label has its own list.
  const auto = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const image of summary?.results ?? []) out.set(image.rel_path, autoTags(image, captions.get(image.abs_path), cohorts));
    return out;
  }, [summary, captions, cohorts]);
  const tags = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [rel, list] of auto) out.set(rel, effectiveTags(list, labels.get(rel)));
    return out;
  }, [auto, labels]);
  const tagOptions = useMemo(() => cohorts.tags.map((rule) => rule.tag).filter((name) => visible.some((image) => (tags.get(image.rel_path) ?? []).includes(name))), [cohorts, visible, tags]);
  const viewed = useMemo(() => filterByTag(filterByFaces(filterByRace(filterByAge(visible, ageFrom, ageTo), race), faceView), tags, tag), [visible, ageFrom, ageTo, race, faceView, tags, tag]);
  const facesKnown = useMemo(() => facesRan(summary), [summary]);
  const gallery = useMemo(() => sortImages(filterByKeep(viewed, reasons, keepView), sort, sortDirection), [viewed, reasons, keepView, sort, sortDirection]);
  const keepCounts = useMemo(() => {
    if (!reasons) return null;
    let kept = 0;
    for (const image of viewed) if (reasons.get(image.rel_path) === "") kept += 1;
    return { kept, leftOut: viewed.length - kept };
  }, [viewed, reasons]);
  const subset = useMemo(() => (summary && reasons ? evaluateSubset(summary, reasons, view.filter.minScore) : null), [summary, reasons, view.filter.minScore]);
  const policyNames = useMemo(() => policiesRun(summary), [summary]);
  const stats = useMemo(() => policyStats(viewed, labels, policyNames), [viewed, labels, policyNames]);
  // Cohorts compare against the rest of the view, so they are read before the tag filter narrows it.
  const cohortBase = useMemo(() => filterByFaces(filterByRace(filterByAge(visible, ageFrom, ageTo), race), faceView), [visible, ageFrom, ageTo, race, faceView]);
  const cohortsInView = useMemo(() => cohortStats(cohortBase, tags, cohorts, policyNames), [cohortBase, tags, cohorts, policyNames]);
  const labelledInView = useMemo(() => viewed.filter((image) => labels.get(image.rel_path)?.expect != null).length, [viewed, labels]);

  // Labels follow the scanned folder, not the scan, so they survive a rescan under other policies.
  const scanFolderPath = summary?.folder ?? null;
  useEffect(() => {
    if (!scanFolderPath) return;
    if (scanFolderPath === labelsFolder) return;
    let cancel = false;
    getLabels(scanFolderPath)
      .then((file) => {
        if (cancel) return;
        setLabels(new Map(Object.entries(file.labels)));
        setLabelsFolder(scanFolderPath);
        setLabelError(null);
      })
      .catch((err: unknown) => {
        if (!cancel) setLabelError(err instanceof Error ? err.message : "Could not load labels.");
      });
    return () => {
      cancel = true;
    };
  }, [scanFolderPath, labelsFolder]);

  async function saveLabel(relPath: string, next: Omit<ImageLabel, "updated_at"> | null) {
    if (!scanFolderPath) return;
    setLabelSaving(true);
    setLabelError(null);
    try {
      const file = await putLabel(scanFolderPath, relPath, next);
      setLabels(new Map(Object.entries(file.labels)));
      setLabelsFolder(scanFolderPath);
    } catch (err: unknown) {
      setLabelError(err instanceof Error ? err.message : "Could not save the label.");
    } finally {
      setLabelSaving(false);
    }
  }

  function downloadLabels() {
    if (!summary) return;
    const absPaths = new Map(summary.results.map((image) => [image.rel_path, image.abs_path]));
    downloadText("guard-labels.jsonl", labelsJsonl(summary.folder, labels, absPaths, tags), "application/x-ndjson");
  }
  const displayBlur = useMemo(() => ({ ...blur, unblurNsfw }), [blur, unblurNsfw]);
  const flagged = useMemo(() => gallery.filter((image) => isMinorExposed(image)).map((image) => image.rel_path), [gallery]);

  const pages = Math.max(1, Math.ceil(gallery.length / PAGE_SIZE) || 1);
  const page = Math.min(view.page, pages);

  const scanBusy = scanning || Boolean(scanList?.active);
  // The scan on screen is the one still running, here or in another tab.
  const liveScan = scanning || Boolean(scanList?.active && (!summary || summary.scan_id === scanList.active.scan_id));
  const canScan = sourceReady && !scanBusy;

  const onScan = useCallback(async () => {
    if (!sourceReady || scanning || scanList?.active) return;
    setScanning(true);
    setError(null);
    setProgress([{ phase: "starting", done: 0, total: 0 }]);
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
        policyChoice,
        { skipGarments: view.skipGarments, setAge: view.setAge },
        (event) => {
          setProgress((current) => mergeProgress(current ?? [], event));
          // Curator 0.5.1 says on every progress event which checks are still running.
          if (event.pending_checks) setPendingChecks(event.pending_checks);
        },
        (chunk) => {
          setProgress((current) => mergeProgress(current ?? [], { phase: chunk.phase, done: chunk.done, total: chunk.total }));
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
      if (err instanceof ScanStopped) {
        // Stopped on purpose, here or from another tab: the curator dropped
        // the partial summary, so the page lets go of it too.
        setSummary(null);
        setSelection(null);
        setPendingChecks([]);
        replaceView(withoutScan(viewFromSearch(currentSearch())));
      } else {
        setError(err instanceof Error ? err.message : "Scan failed.");
      }
    } finally {
      setScanning(false);
      setStopping(false);
      setProgress(null);
      void getScans().then((body) => {
        if (body) setScanList(body);
      });
    }
  }, [sourceReady, scanning, scanList?.active, view, policyChoice]);

  const scanControl = Boolean(health?.scan_control);
  // The bar for our own scan, or for the one running in another tab when that is the scan on screen.
  const liveProgress: Progress | readonly Progress[] | null =
    progress ?? (scanList?.active && (!summary || summary.scan_id === scanList.active.scan_id) ? scanList.active : null);

  // The id of our own scan is only known once the first chunk lands, so ask
  // the curator which scan is running rather than guessing.
  const onStop = useCallback(async () => {
    setStopping(true);
    setError(null);
    try {
      const list = await getScans();
      const id = list?.active?.scan_id;
      if (!id) return;
      await cancelScan(id);
      if (list?.active) setScanList({ ...list, active: { ...list.active, cancelling: true } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not stop the scan.");
    } finally {
      // Our own stream ends with the stop; another tab's shows up on the next /scans poll.
      if (!scanning) setStopping(false);
    }
  }, [scanning]);

  const onPurge = useCallback(async () => {
    setPurging(true);
    setError(null);
    try {
      await purgeScans();
      // Our own scan's stream, if one was running, ends with ScanStopped and
      // clears the summary; a cached scan on screen goes here.
      if (!scanning) {
        setSummary(null);
        setSelection(null);
        setPendingChecks([]);
        replaceView(withoutScan(viewFromSearch(currentSearch())));
      }
      const body = await getScans();
      if (body) setScanList(body);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not purge the scans.");
    } finally {
      setPurging(false);
    }
  }, [scanning]);

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

  function changeGallery(patch: { sort?: GridSort; direction?: SortDirection; ageFrom?: number | null; ageTo?: number | null; race?: FaceRace | null; faceView?: FaceView; tag?: string | null }) {
    if (patch.sort != null) setSort(patch.sort);
    if (patch.direction != null) setSortDirection(patch.direction);
    if ("ageFrom" in patch) setAgeFrom(patch.ageFrom ?? null);
    if ("ageTo" in patch) setAgeTo(patch.ageTo ?? null);
    if ("race" in patch) setRace(patch.race ?? null);
    if (patch.faceView != null) setFaceView(patch.faceView);
    if ("tag" in patch) setTag(patch.tag ?? null);
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
      if (shouldBlur(image, pending, displayBlur, labels.get(image.rel_path)?.override ?? null)) flagged.add(image.rel_path);
    }
    return flagged;
  }, [summary, pending, displayBlur, labels]);
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
      const result = await exportScan(summary.scan_id, dest, mode, selectBody(view.filter, gates, summary), setExportProgress);
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
        <PolicyPicker
          available={detectors?.singguard_policies ?? []}
          choice={policyChoice}
          disabled={scanBusy}
          onChange={(next) => replaceView({ ...view, guardPolicy: next.policy, guardVariants: next.variants })}
        />
        <ScanChecks
          detectors={detectors}
          health={health}
          summary={summary}
          skipGarments={view.skipGarments}
          setAge={view.setAge}
          disabled={scanBusy}
          onSkipGarments={(skip) => replaceView({ ...view, skipGarments: skip })}
          onSetAge={(on) => replaceView({ ...view, setAge: on })}
        />
        <ScanListView
          scans={scanList}
          root={health?.source_root ?? null}
          current={view.scan}
          canPurge={scanControl}
          purging={purging}
          onOpen={(scanId, folder) => replaceView({ ...withoutScan(view, folder), scan: scanId })}
          onPurge={() => void onPurge()}
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
            <button type="button" className="rounded-md border border-base-600 px-3 py-1.5 text-small disabled:opacity-40" disabled={policyNames.length === 0} onClick={() => setPolicyOpen(true)}>
              Policies
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
          {liveProgress ? (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <ProgressBar progress={liveProgress} />
              </div>
              {scanControl ? (
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-base-600 px-3 py-1.5 text-small hover:border-warning hover:text-warning disabled:opacity-40"
                  disabled={stopping || Boolean(scanList?.active?.cancelling)}
                  title="Stop the running scan. Checks already in flight finish; the partial scan is dropped."
                  onClick={() => void onStop()}
                >
                  {stopping || scanList?.active?.cancelling ? "Stopping…" : "Stop"}
                </button>
              ) : null}
            </div>
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
            scanning={liveScan}
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
            faceView={faceView}
            onFaceView={(next) => changeGallery({ faceView: next })}
            facesRan={facesKnown}
            tag={tag}
            tagOptions={tagOptions}
            onTag={(next) => changeGallery({ tag: next })}
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
            labels={labels}
          />
        ) : null}
        {summary && view.view === "people" && view.cluster ? (
          <PhotoGrid
            images={gallery}
            reasons={reasons}
            scanId={summary.scan_id}
            page={page}
            pending={pending}
            scanning={liveScan}
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
            faceView={faceView}
            onFaceView={(next) => changeGallery({ faceView: next })}
            facesRan={facesKnown}
            tag={tag}
            tagOptions={tagOptions}
            onTag={(next) => changeGallery({ tag: next })}
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
            labels={labels}
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
          facesRan={facesKnown}
          scanning={liveScan}
          blur={displayBlur}
          onClose={() => replaceView({ ...view, photo: null })}
          onPrevious={previousPhoto ? () => openPhoto(previousPhoto.rel_path) : null}
          onNext={nextPhoto ? () => openPhoto(nextPhoto.rel_path) : null}
          position={photoIndex >= 0 ? `${photoIndex + 1} of ${gallery.length}` : null}
          label={labels.get(photo.rel_path) ?? null}
          policies={policyNames}
          labelSaving={labelSaving}
          labelError={labelError}
          onLabel={(next) => void saveLabel(photo.rel_path, next)}
          cohorts={cohorts}
          autoTags={auto.get(photo.rel_path) ?? []}
          caption={captions.get(photo.abs_path) ?? null}
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
      {policyOpen ? (
        <PolicyDialog
          stats={stats}
          total={viewed.length}
          labelled={labelledInView}
          cohorts={cohortsInView}
          cohortTotal={cohortBase.length}
          cohortNotes={[cohortError, wantsCaptions ? captionError : null].filter((note): note is string => Boolean(note))}
          onClose={() => setPolicyOpen(false)}
          onDownloadLabels={labels.size > 0 ? downloadLabels : null}
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
