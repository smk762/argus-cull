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
}

export interface ExportExtras {
  writeXmp?: boolean;
  faceNames?: Record<string, string>;
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
  };
}
