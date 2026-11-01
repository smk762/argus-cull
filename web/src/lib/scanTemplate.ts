import { folderLabel } from "./chunks";
import { defaultPolicyChoice, type PolicyChoice } from "./policies";
import { withoutScan } from "./purge";
import type { Detectors, ScanSummary, ViewState } from "./types";

/**
 * What the scan form asks for. The same fields live in the URL (`folder`,
 * `policy`, `variants`, `garments=off`, `set=1`, `bodies=1`), so a shared link opens the
 * form filled the same way, and a scan already run can be read back into it
 * to run again with one change.
 */
export interface ScanTemplate {
  /** Relative to the source root. Empty is the root itself. */
  folder: string;
  policy: PolicyChoice;
  withGarments: boolean;
  setAge: boolean;
  readBodies: boolean;
}

/** The form as the URL has it. The policy falls back the way the picker does when the URL names none. */
export function templateFromView(view: Pick<ViewState, "folder" | "guardPolicy" | "guardVariants" | "withGarments" | "setAge" | "readBodies">, detectors: Detectors | null): ScanTemplate {
  const base = defaultPolicyChoice(detectors?.singguard_policies);
  return {
    folder: view.folder,
    policy: { policy: view.guardPolicy ?? base.policy, variants: [...view.guardVariants] },
    withGarments: view.withGarments,
    setAge: view.setAge,
    readBodies: view.readBodies,
  };
}

/**
 * The form as a finished scan ran it, read from the summary's config blocks.
 * A scan whose config did not record a policy (an older curator, or SingGuard
 * off) takes the picker's default. Garments read as the scan ran them, so a
 * run that read them runs them again unless the box is cleared.
 */
export function templateFromSummary(summary: ScanSummary, root: string | null, detectors: Detectors | null): ScanTemplate {
  const base = defaultPolicyChoice(detectors?.singguard_policies);
  // The curator records a policy name even when SingGuard did not run; only a scan that ran it chose one.
  const guard = summary.guard_config?.enabled === true ? summary.guard_config : null;
  const policy = guard?.policy ?? base.policy;
  return {
    folder: folderLabel(summary.folder, root).rel,
    policy: { policy, variants: (guard?.variants ?? []).filter((name) => name !== policy) },
    withGarments: summary.garments_config.enabled === true,
    setAge: summary.faces_config.set_age === true,
    readBodies: summary.faces_config.mivolo_body === true,
  };
}

/**
 * Write the form back into the view, as the next scan's parameters. The scan
 * on screen is dropped the way a folder change drops it: the page is about to
 * start a new one, and the filters that named its clusters and scenes go too.
 */
/** A run-stats file read back into the form, and what could not be carried over. */
export interface ImportedRun {
  template: ScanTemplate;
  notes: string[];
}

/**
 * Fill the form from a Run stats file (`run-stats-*.json`): its folder, the
 * policies its config names, and the garments, set-age and body checks. A file
 * saved with policies switched off names only the ones left on, so the form
 * runs those. Policies this curator does not offer are dropped and named in
 * `notes`. Throws on a file that is not run stats, or whose folder is outside
 * the source root.
 */
export function templateFromRunStats(raw: unknown, root: string | null, detectors: Detectors | null): ImportedRun {
  const stats = raw as { scan_id?: unknown; folder?: unknown; config?: Record<string, unknown>; policies_off?: unknown } | null;
  if (!stats || typeof stats !== "object" || typeof stats.folder !== "string" || !stats.config || typeof stats.config !== "object") {
    throw new Error("This is not a Run stats file: it has no folder and config.");
  }
  const config = stats.config;
  const base = root ? root.replace(/\/$/, "") : "";
  if (base && stats.folder !== base && !stats.folder.startsWith(`${base}/`)) {
    throw new Error(`The run scanned ${stats.folder}, which is not under this curator's source root (${base}).`);
  }
  const notes: string[] = [];
  const available = detectors?.singguard_policies ?? [];
  const asked = config.guard === true && typeof config.policy === "string" ? [config.policy, ...(Array.isArray(config.variants) ? config.variants.filter((name): name is string => typeof name === "string") : [])] : [];
  const offered = available.length > 0 ? asked.filter((name) => available.includes(name)) : asked;
  const missing = asked.filter((name) => !offered.includes(name));
  if (missing.length > 0) notes.push(`This curator does not offer ${missing.join(", ")}, so ${missing.length === 1 ? "it was" : "they were"} left out.`);
  if (config.guard !== true) notes.push("The run did not record SingGuard, so the form keeps its default policy.");
  const off = Array.isArray(stats.policies_off) ? stats.policies_off.filter((name): name is string => typeof name === "string") : [];
  if (off.length > 0) notes.push(`The file was saved with ${off.join(", ")} switched off, so the form runs only the policies left on.`);
  const policy = offered.length > 0 ? { policy: offered[0], variants: offered.slice(1) } : defaultPolicyChoice(available);
  return {
    template: {
      folder: folderLabel(stats.folder, root).rel,
      policy,
      withGarments: config.garments === true,
      setAge: config.set_age === true,
      readBodies: config.mivolo_body === true,
    },
    notes,
  };
}

export function viewWithTemplate(view: ViewState, template: ScanTemplate): ViewState {
  return {
    ...withoutScan(view, template.folder),
    guardPolicy: template.policy.policy,
    guardVariants: [...template.policy.variants],
    withGarments: template.withGarments,
    setAge: template.setAge,
    readBodies: template.readBodies,
    view: "grid",
  };
}

/** One line naming what a template would run, for the form's title and the table's tooltip. */
export function templateSummary(template: ScanTemplate, detectors: Detectors | null): string {
  const parts: string[] = [];
  if (detectors?.singguard_policies?.length) {
    parts.push(template.policy.variants.length > 0 ? `${template.policy.policy} + ${template.policy.variants.join(", ")}` : template.policy.policy);
  }
  if (detectors?.garments && template.withGarments) parts.push("garments");
  if (template.setAge) parts.push("set age");
  if (template.readBodies) parts.push("bodies");
  return parts.join(" · ");
}
