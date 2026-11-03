import { namedFaces } from "./urlState";
import type { ExportMode, ExportResult, SelectRequest, SelectRow } from "./types";

export function lines(values: readonly string[]): string {
  if (values.length === 0) return "";
  return `${values.join("\n")}\n`;
}

/** Kept relative paths, one per line. Empty keep_reason means the filter kept the file. */
export function keptPathList(rows: readonly SelectRow[]): string {
  return lines(rows.filter((row) => row.keep_reason === "").map((row) => row.rel_path));
}

/** Every row, including ones the filter dropped, so a script can see why. */
export function selectionJsonl(rows: readonly SelectRow[]): string {
  if (rows.length === 0) return "";
  const body = rows
    .map((row) => JSON.stringify({ rel_path: row.rel_path, abs_path: row.abs_path, keep_reason: row.keep_reason }))
    .join("\n");
  return `${body}\n`;
}

export function exportedAbsPathList(result: Pick<ExportResult, "exported_abs_paths">): string {
  return lines(Object.values(result.exported_abs_paths));
}

export interface ExportBody extends SelectRequest {
  scan_id: string;
  dest: string;
  mode: ExportMode;
  preserve_structure: boolean;
  write_manifest: boolean;
  write_xmp?: boolean;
  face_names?: Record<string, string>;
  carry_sidecars?: boolean;
  run_stats?: unknown;
}

export interface ExportExtras {
  writeXmp?: boolean;
  faceNames?: Record<string, string>;
  /** Move, copy or link each image's `.txt` / `.xmp` / `.json` sidecars with it. Sent only to a curator that reports `export_sidecars`. */
  carrySidecars?: boolean;
  /** The Run stats JSON, written into the export folder as `run_stats.json`. Same curator gate. */
  runStats?: unknown;
}

/**
 * Where an export of a scan lands by default: the scan folder's path under
 * the source root, so the curated output root mirrors the source root's
 * folders. A scan of the root itself has no path of its own and gets `selection`.
 */
export function defaultExportDest(scanRel: string): string {
  const rel = scanRel.replace(/^\/+|\/+$/g, "");
  return rel || "selection";
}

export function exportBody(
  scanId: string,
  dest: string,
  mode: ExportMode,
  filter: SelectRequest,
  extras: ExportExtras = {},
): ExportBody {
  const names = namedFaces(extras.faceNames ?? {});
  return {
    ...filter,
    scan_id: scanId,
    dest,
    mode,
    preserve_structure: true,
    write_manifest: true,
    ...(extras.writeXmp ? { write_xmp: true } : {}),
    ...(names ? { face_names: names } : {}),
    ...(extras.carrySidecars ? { carry_sidecars: true } : {}),
    ...(extras.runStats != null ? { run_stats: extras.runStats } : {}),
  };
}
