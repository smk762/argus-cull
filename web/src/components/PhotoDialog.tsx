"use client";

import { useEffect, useState, type ReactNode } from "react";

import { imageUrl, thumbUrl } from "@/lib/api";
import { DEFAULT_BLUR, isMinorExposed, shouldBlur, youngestAge, type BlurPolicy } from "@/lib/chunks";
import { effectiveTags, EMPTY_COHORTS, type Caption, type CohortConfig, type CohortRule } from "@/lib/cohorts";
import { splitGuardExplanation } from "@/lib/guardText";
import { EXPECT_LABELS, EXPECTS, type ImageLabel } from "@/lib/labels";
import { nudeNetLabel } from "@/lib/moderation";
import { effectiveUnsafe, policyVerdicts, shieldLabel, shieldState, shieldTitle, verdictConflict } from "@/lib/policies";
import { NUDENET_LABELS, slugLabel, type FaceAttributes, type GuardResult, type ImageResult, type NsfwResult } from "@/lib/types";

import { Shield } from "./Shield";

const SCORE_PARTS: [string, string][] = [
  ["sharpness", "Sharpness"],
  ["resolution", "Resolution"],
  ["artifact", "Artifact"],
  ["target_bonus", "Target bonus"],
  ["face_penalty", "Face penalty"],
];

type Row = [label: ReactNode, value: ReactNode, note?: ReactNode];

/** A two- or three-column key/value table. Null rows are skipped so callers can inline conditions. */
function StatTable({ title, rows, caption }: { title: string; rows: (Row | null)[]; caption?: ReactNode }) {
  const shown = rows.filter((row): row is Row => row != null);
  if (shown.length === 0) return null;
  const notes = shown.some((row) => row[2] != null);
  return (
    <section>
      <h3 className="text-caption text-text-muted">{title}</h3>
      <table className="mt-1 w-full border-collapse text-small tabular-nums">
        <tbody>
          {shown.map((row, index) => (
            <tr key={index} className="border-t border-base-700 first:border-t-0">
              <th scope="row" className="w-2/5 py-1 pr-3 text-left font-normal text-text-secondary">
                {row[0]}
              </th>
              <td className="py-1 pr-3">{row[1]}</td>
              {notes ? <td className="py-1 text-caption text-text-muted">{row[2]}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {caption ? <p className="mt-1 text-caption leading-relaxed text-text-muted">{caption}</p> : null}
    </section>
  );
}

/** A list of label/confidence pairs as a table. */
function ConfTable({ title, rows, caption }: { title: string; rows: { label: string; conf: number }[]; caption?: ReactNode }) {
  if (rows.length === 0 && !caption) return null;
  return (
    <section>
      <h3 className="text-caption text-text-muted">{title}</h3>
      {rows.length > 0 ? (
        <table className="mt-1 w-full border-collapse text-small tabular-nums">
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.label}-${index}`} className="border-t border-base-700 first:border-t-0">
                <td className="py-1 pr-3">{row.label}</td>
                <td className="w-16 py-1 text-right">{row.conf.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {caption ? <p className="mt-1 text-caption leading-relaxed text-text-muted">{caption}</p> : null}
    </section>
  );
}

function QualityTable({ image }: { image: ImageResult }) {
  const breakdown = image.score_breakdown ?? {};
  const known = new Set(SCORE_PARTS.map(([key]) => key));
  const extra = Object.entries(breakdown).filter(([key]) => !known.has(key));
  return (
    <StatTable
      title="Quality"
      rows={[
        ["Score", <span key="score" className="font-semibold">{image.score.toFixed(3)}</span>, image.reject_reason ? image.reject_reason : undefined],
        ...SCORE_PARTS.filter(([key]) => breakdown[key] != null).map(([key, label]): Row => [label, breakdown[key].toFixed(3)]),
        ...extra.map(([key, value]): Row => [key.replaceAll("_", " "), value.toFixed(3)]),
        ["Size", `${image.width}×${image.height}`],
        ["Sharpness, raw", image.sharpness.toFixed(1)],
        image.artifact_score != null ? ["Artifact, raw", image.artifact_score.toFixed(2)] : null,
      ]}
    />
  );
}

function AppearanceTable({ image }: { image: ImageResult }) {
  const attrs: FaceAttributes | null = image.primary_face_attributes;
  const otherRaces = (image.faces ?? [])
    .filter((face) => !face.primary && face.attributes?.race && face.attributes.race !== attrs?.race)
    .map((face) => slugLabel(face.attributes?.race ?? ""));
  const youngest = youngestAge(image);
  const faceCount = image.faces?.length ?? 0;
  if (!attrs && !image.primary_face_pose && faceCount === 0) return null;
  const age = attrs?.age_years != null ? `${Math.round(attrs.age_years)} years` : attrs?.age ?? null;
  return (
    <StatTable
      title="Appearance guess"
      rows={[
        attrs?.gender ? ["Gender", attrs.gender, [attrs.gender_source, attrs.gender_conf != null ? attrs.gender_conf.toFixed(2) : null].filter(Boolean).join(" · ")] : null,
        age ? ["Age", age, [attrs?.age_source, attrs?.age_conf != null ? attrs.age_conf.toFixed(2) : null].filter(Boolean).join(" · ")] : null,
        youngest != null && attrs?.age_years != null && youngest < attrs.age_years ? ["Youngest face", `${Math.round(youngest)} years`, "mivolo"] : null,
        ["Race", attrs?.race ? slugLabel(attrs.race) : <span className="text-text-muted">not recorded</span>, attrs?.race ? ["fairface", attrs.race_conf != null ? attrs.race_conf.toFixed(2) : null].filter(Boolean).join(" · ") : "FairFace is the only model that records race"],
        otherRaces.length > 0 ? ["Other faces", otherRaces.join(", ")] : null,
        image.primary_face_pose ? ["Head pose", image.primary_face_pose.replaceAll("_", " ")] : null,
        faceCount > 1 ? ["Faces", String(faceCount)] : null,
      ]}
      caption="Appearance guesses from the primary face. Sources are named so a guess is not read as a fact."
    />
  );
}

function NudeNetTable({ nsfw }: { nsfw: NsfwResult }) {
  const detected = NUDENET_LABELS.filter((label) => nsfw.labels[label] != null).sort((left, right) => nsfw.labels[right] - nsfw.labels[left]);
  const quiet = NUDENET_LABELS.filter((label) => nsfw.labels[label] == null);
  return (
    <section>
      <h3 className="text-caption text-text-muted">NudeNet</h3>
      <table className="mt-1 w-full border-collapse text-small tabular-nums">
        <tbody>
          <tr>
            <th scope="row" className="w-2/5 py-1 pr-3 text-left font-normal text-text-secondary">
              Exposed score
            </th>
            <td className="py-1 font-semibold">{nsfw.exposed_score.toFixed(2)}</td>
          </tr>
          {detected.map((label) => (
            <tr key={label} className="border-t border-base-700">
              <td className="py-1 pr-3">{nudeNetLabel(label)}</td>
              <td className="py-1">{nsfw.labels[label].toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-caption leading-relaxed text-text-muted">
        The exposed score is the highest of the five exposed classes; other classes do not raise it.
        {detected.length === 0 ? " No class scored 0.2 or above." : quiet.length > 0 ? ` Under 0.2: ${quiet.map((label) => nudeNetLabel(label)).join(", ")}.` : ""}
      </p>
    </section>
  );
}

function GuardReport({ guard }: { guard: GuardResult }) {
  const steps = splitGuardExplanation(guard.explanation ?? "", guard.rules);
  if (steps.length === 0) return <p className="mt-2 text-caption text-text-muted">No reasoning recorded. Set ARGUS_CURATOR_SINGGUARD_THINKING=fast-slow to keep it.</p>;
  return (
    <div className="mt-3 space-y-3">
      {steps.map((step) => (
        <div key={step.title}>
          <h4 className="font-semibold">{step.title}</h4>
          {step.paragraphs.map((paragraph, index) => (
            <p key={`${step.title}-${index}`} className="mt-1 text-caption leading-relaxed text-text-secondary">
              {paragraph}
            </p>
          ))}
          {step.rules.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {step.rules.map((rule) => (
                <li key={rule.letter} className={`text-caption leading-relaxed ${rule.fired ? "border-l-2 border-warning pl-2 text-text-primary" : "text-text-muted"}`}>
                  <span className="font-semibold">
                    {rule.letter}. {rule.name}.
                  </span>{" "}
                  {rule.detail}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * One row per policy that judged the image, then the reasoning behind each
 * verdict in a collapsed section. A verdict that flagged, differs from the
 * official one, or is the one the shield follows starts open.
 */
function PolicyReports({ image, override }: { image: ImageResult; override: string | null }) {
  const verdicts = policyVerdicts(image);
  if (verdicts.length === 0) return null;
  const official = verdicts.find((verdict) => verdict.official) ?? null;
  const state = shieldState(image, override);
  const conflicts = verdicts.filter((verdict) => verdictConflict(verdict.result));
  return (
    <section className="border-t border-base-700 pt-3">
      <h3 className="flex items-center gap-2 text-caption text-text-muted">
        <Shield state={state} title={shieldTitle(image, override)} />
        SingGuard
      </h3>
      <table className="mt-1 w-full border-collapse text-small">
        <thead>
          <tr className="text-left text-caption font-normal text-text-muted">
            <th className="py-1 pr-3 font-normal">Policy</th>
            <th className="py-1 pr-3 font-normal">Verdict</th>
            <th className="py-1 pr-3 font-normal">Rule</th>
            <th className="py-1 font-normal">Note</th>
          </tr>
        </thead>
        <tbody>
          {verdicts.map((verdict) => {
            const differs = official != null && !verdict.official && verdict.result.safe !== official.result.safe;
            const conflict = verdictConflict(verdict.result);
            const notes = [
              verdict.official ? "official" : null,
              override === verdict.policy ? "shield follows this" : null,
              differs ? "differs from official" : null,
              conflict ? "answer said Safe" : null,
            ].filter(Boolean);
            return (
              <tr key={verdict.policy} className="border-t border-base-700">
                <td className="py-1 pr-3">{verdict.policy}</td>
                <td className={`py-1 pr-3 ${verdict.result.safe ? "text-success" : "text-warning"}`}>{verdict.result.safe ? "Safe" : "Unsafe"}</td>
                <td className="py-1 pr-3">{verdict.result.safe || conflict ? <span className="text-text-muted">–</span> : verdict.result.rules.join(", ")}</td>
                <td className={`py-1 text-caption ${conflict ? "text-warning" : "text-text-muted"}`}>{notes.join(" · ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {conflicts.length > 0 ? (
        <p className="mt-2 text-caption leading-relaxed text-warning">
          SingGuard&apos;s first-line signal said unsafe and its reasoned answer said Safe. The recorded verdict kept the first line. The current server records the answer; rescan to settle it.
        </p>
      ) : null}
      <div className="mt-2 space-y-2">
        {verdicts.map((verdict) => {
          const differs = official != null && !verdict.official && verdict.result.safe !== official.result.safe;
          const open = !verdict.result.safe || differs || override === verdict.policy;
          return (
            <details key={verdict.policy} open={open} className="rounded-md border border-base-700 px-3 py-2">
              <summary className="cursor-pointer text-small">
                <span className={verdict.result.safe ? "text-success" : "text-warning"}>{verdict.result.safe ? "Safe" : "Unsafe"}</span>
                {` · ${verdict.policy}`}
                <span className="text-text-muted"> · reasoning</span>
              </summary>
              <GuardReport guard={verdict.result} />
            </details>
          );
        })}
      </div>
    </section>
  );
}

/** The saved fields of a label, so a change to one keeps the others, tags included. */
function labelFields(label: ImageLabel | null): Omit<ImageLabel, "updated_at"> {
  return {
    expect: label?.expect ?? null,
    proxy: label?.proxy ?? false,
    override: label?.override ?? null,
    note: label?.note ?? "",
    ...(label?.tags ? { tags: label.tags } : {}),
  };
}

/** A collapsible section that starts open when it holds a value. The summary names what is set. */
function Fold({ title, summary, open, children }: { title: string; summary: string | null; open: boolean; children: ReactNode }) {
  return (
    <details open={open} className="border-t border-base-700 pt-3">
      <summary className="cursor-pointer text-caption text-text-muted">
        {title}
        {summary ? <span className="text-text-secondary"> · {summary}</span> : null}
      </summary>
      {children}
    </details>
  );
}

/** What a correct verdict is for this image, kept on this page's server. Scored against every policy in the Policies panel. */
function LabelControl({
  label,
  policies,
  saving,
  error,
  onChange,
}: {
  label: ImageLabel | null;
  policies: string[];
  saving: boolean;
  error: string | null;
  onChange: (next: Omit<ImageLabel, "updated_at"> | null) => void;
}) {
  const current = labelFields(label);
  const update = (patch: Partial<typeof current>) => onChange({ ...current, ...patch });
  const canProxy = current.expect === "hard" || current.expect === "ambiguous";
  const set = Boolean(current.expect || current.override || (current.note && current.note.trim()));
  const summary = [
    current.expect ? EXPECT_LABELS[current.expect].label + (current.proxy ? " (proxy)" : "") : null,
    current.override ? `follows ${current.override}` : null,
    current.note && current.note.trim() ? "note" : null,
    saving ? "saving" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Fold title="Label" summary={summary || null} open={set}>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Correct verdict">
        {EXPECTS.map((expect) => (
          <button
            key={expect}
            type="button"
            title={EXPECT_LABELS[expect].detail}
            aria-pressed={current.expect === expect}
            className={`rounded-md border px-2 py-1 text-small ${current.expect === expect ? "border-accent-primary text-text-primary" : "border-base-600 text-text-secondary"}`}
            onClick={() => update({ expect: current.expect === expect ? null : expect, proxy: expect === "hard" || expect === "ambiguous" ? current.proxy : false })}
          >
            {EXPECT_LABELS[expect].label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-caption text-text-muted">{current.expect ? EXPECT_LABELS[current.expect].detail : "Hard, ambiguous, and other count as positives; adult and safe as negatives."}</p>
      {canProxy ? (
        <label className="mt-2 flex items-center gap-2 text-small">
          <input type="checkbox" checked={Boolean(current.proxy)} onChange={(event) => update({ proxy: event.target.checked })} />
          Proxy: verified 18+, standing in for a hard case
        </label>
      ) : null}
      {policies.length > 1 ? (
        <label className="mt-2 flex items-center gap-2 text-small">
          Shield follows
          <select
            className="rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
            value={current.override ?? ""}
            onChange={(event) => update({ override: event.target.value || null })}
          >
            <option value="">any policy that flags</option>
            {policies.map((policy) => (
              <option key={policy} value={policy}>
                {policy} only
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <input
        className="mt-2 w-full rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
        type="text"
        placeholder="Note"
        aria-label="Label note"
        defaultValue={current.note ?? ""}
        onBlur={(event) => {
          if (event.target.value !== (current.note ?? "")) update({ note: event.target.value });
        }}
      />
      {error ? <p className="mt-1 text-caption text-warning">{error}</p> : null}
    </Fold>
  );
}

/**
 * Setting and wardrobe tags. The automatic set comes from cohorts.json over the
 * scene and caption; a click makes the list the image's own, and Automatic
 * hands it back.
 */
function TagControl({
  cohorts,
  auto,
  label,
  caption,
  saving,
  onChange,
}: {
  cohorts: CohortConfig;
  auto: readonly string[];
  label: ImageLabel | null;
  caption: Caption | null;
  saving: boolean;
  onChange: (tags: string[] | undefined) => void;
}) {
  if (cohorts.tags.length === 0) return null;
  const byHand = label?.tags != null;
  const current = effectiveTags(auto, label);
  const groups = new Map<string, CohortRule[]>();
  for (const rule of cohorts.tags) groups.set(rule.group, [...(groups.get(rule.group) ?? []), rule]);
  const toggle = (tag: string) => {
    const next = current.includes(tag) ? current.filter((name) => name !== tag) : [...current, tag];
    onChange(next);
  };
  const excerpt = caption ? [caption.text, caption.keywords.join(", ")].filter(Boolean).join(" · ") : "";
  const summary = [current.length > 0 ? current.join(", ") : null, byHand ? "by hand" : current.length > 0 ? "automatic" : null, saving ? "saving" : null].filter(Boolean).join(" · ");
  return (
    <Fold title="Setting and wardrobe" summary={summary || null} open={current.length > 0 || byHand}>
      {[...groups.entries()].map(([group, rules]) => (
        <div key={group} className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={`${group} tags`}>
          <span className="w-16 text-caption text-text-muted">{group}</span>
          {rules.map((rule) => {
            const on = current.includes(rule.tag);
            const automatic = auto.includes(rule.tag);
            return (
              <button
                key={rule.tag}
                type="button"
                aria-pressed={on}
                title={[rule.scenes.length > 0 ? `Places365: ${rule.scenes.join(", ")}` : "", rule.captions.length > 0 ? `Caption: ${rule.captions.join(", ")}` : ""].filter(Boolean).join("\n")}
                className={`rounded-md border px-2 py-1 text-small ${on ? "border-accent-primary text-text-primary" : "border-base-600 text-text-secondary"}`}
                onClick={() => toggle(rule.tag)}
              >
                {rule.tag}
                {on && automatic && !byHand ? <span className="text-text-muted"> · auto</span> : null}
              </button>
            );
          })}
        </div>
      ))}
      {byHand ? (
        <button type="button" className="mt-2 rounded-md border border-base-600 px-2 py-1 text-small text-text-secondary" onClick={() => onChange(undefined)}>
          Automatic ({auto.length === 0 ? "none" : auto.join(", ")})
        </button>
      ) : null}
      {excerpt ? (
        <p className="mt-2 text-caption leading-relaxed text-text-muted">
          Caption: <span className="text-text-secondary">{excerpt.length > 400 ? `${excerpt.slice(0, 400)}…` : excerpt}</span>
        </p>
      ) : cohorts.tags.some((rule) => rule.captions.length > 0) ? (
        <p className="mt-2 text-caption text-text-muted">No caption sidecar next to this image, so wardrobe and prop tags are by hand only.</p>
      ) : null}
    </Fold>
  );
}

/** The four numbers a reader checks first, in one row above the tables. */
function Summary({ image, reason, override, checking }: { image: ImageResult; reason: string | undefined; override: string | null; checking: boolean }) {
  const attrs = image.primary_face_attributes;
  const age = attrs?.age_years != null ? `${Math.round(attrs.age_years)}y` : attrs?.age ?? "–";
  const state = shieldState(image, override);
  const cells: [string, ReactNode][] = [
    ["Selection", <span key="sel" className={reason === undefined ? "text-text-muted" : reason ? "text-warning" : "text-success"}>{reason === undefined ? "Selecting…" : reason || "keep"}</span>],
    [
      "Policy",
      <span key="pol" className="flex items-center gap-1.5">
        <Shield state={state} title={shieldTitle(image, override)} />
        {state === "none" ? <span className="text-text-muted">{checking ? "checking" : "no verdict"}</span> : shieldLabel(state)}
      </span>,
    ],
    ["Quality", image.score.toFixed(3)],
    ["NudeNet", image.nsfw ? image.nsfw.exposed_score.toFixed(2) : <span className="text-text-muted">{checking ? "…" : "–"}</span>],
    ["Age", age],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-lg border border-base-700 bg-base-900/60 p-3 text-small tabular-nums sm:grid-cols-5">
      {cells.map(([label, value]) => (
        <div key={label}>
          <dt className="text-caption text-text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PhotoDialog({
  image,
  scanId,
  reason,
  pending,
  blur = DEFAULT_BLUR,
  onClose,
  onDelete,
  onPrevious,
  onNext,
  position,
  label = null,
  policies = [],
  labelSaving = false,
  labelError = null,
  onLabel,
  cohorts = EMPTY_COHORTS,
  autoTags = [],
  caption = null,
}: {
  image: ImageResult;
  scanId: string;
  reason: string | undefined;
  pending: readonly string[];
  blur?: BlurPolicy;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  position: string | null;
  label?: ImageLabel | null;
  /** Policies the scan ran, official first. */
  policies?: string[];
  labelSaving?: boolean;
  labelError?: string | null;
  onLabel?: (next: Omit<ImageLabel, "updated_at"> | null) => void;
  /** Cohort rules, the tags they derive for this image, and the caption sidecar they read. */
  cohorts?: CohortConfig;
  autoTags?: readonly string[];
  caption?: Caption | null;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && onPrevious) {
        event.preventDefault();
        onPrevious();
      }
      if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrevious, onNext]);

  const [shown, setShown] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const worn = (image.garments ?? []).map((garment) => ({ label: slugLabel(garment.label), conf: garment.conf }));
  const blocked = isMinorExposed(image);
  const checking = pending.includes("nsfw") && image.nsfw == null;
  // No reveal until NudeNet has reported: MiVOLO may still read a face as under 18.
  const holdReveal = blocked || checking;
  const override = label?.override ?? null;
  const obscured = shouldBlur(image, pending, blur, override);
  const blurred = blocked || (obscured && !shown);

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the file.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/80 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-title"
        className="max-h-[90dvh] w-full max-w-5xl overflow-auto rounded-xl bg-base-800 p-4 shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="photo-title" className="font-display text-subheading break-all">
            {image.rel_path}
          </h2>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small disabled:opacity-40" disabled={!onPrevious} onClick={() => onPrevious?.()}>
              Previous
            </button>
            <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small disabled:opacity-40" disabled={!onNext} onClick={() => onNext?.()}>
              Next
            </button>
            {position ? <span className="self-center text-caption text-text-muted">{position}</span> : null}
            {blocked ? (
              <button
                type="button"
                className="rounded-md border border-warning px-3 py-1 text-small text-warning disabled:opacity-40"
                disabled={deleting}
                onClick={() => void remove()}
              >
                {deleting ? "Deleting…" : confirmDelete ? "Confirm delete" : "Delete"}
              </button>
            ) : obscured && !holdReveal ? (
              <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small" onClick={() => setShown((open) => !open)}>
                {shown ? "Blur" : "Unblur"}
              </button>
            ) : null}
            <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-lg bg-base-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={blocked ? thumbUrl(scanId, image.rel_path) : imageUrl(scanId, image.rel_path)}
            alt={blurred ? "" : image.rel_path}
            className={`max-h-[70dvh] w-full object-contain ${blurred ? "scale-105 blur-3xl" : ""}`}
          />
          {blurred && !blocked && !holdReveal ? (
            <button
              type="button"
              className="absolute inset-0 m-auto h-fit w-fit rounded-md bg-base-800 px-4 py-2 text-small"
              onClick={() => setShown(true)}
            >
              Unblur
            </button>
          ) : null}
          {holdReveal && !blocked ? (
            <p className="absolute inset-0 m-auto h-fit w-fit rounded-md bg-base-800 px-4 py-2 text-small">Checking</p>
          ) : null}
          {blocked ? (
            <p className="absolute inset-x-4 bottom-4 rounded-md bg-base-800 px-3 py-2 text-caption text-text-secondary">
              MiVOLO reads a face as under 18 and NudeNet reported an exposed score of at least 0.2. This photo stays blurred and will not be kept.
            </p>
          ) : null}
        </div>
        <div className="mt-4 space-y-4 text-small">
          <Summary image={image} reason={reason} override={override} checking={checking} />
          {blocked ? (
            <p className="text-caption text-warning">
              {deleteError ?? "Delete removes this file from the source folder. Review the ages and scores in this panel first."}
            </p>
          ) : null}
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            <QualityTable image={image} />
            <AppearanceTable image={image} />
            {image.scene ? (
              <ConfTable
                title="Places365"
                rows={image.scene.categories.map((category) => ({ label: category.label, conf: category.conf }))}
                caption={`Environment: ${image.scene.environment}`}
              />
            ) : null}
            {worn.length > 0 ? <ConfTable title="Fashionpedia" rows={worn} /> : null}
            {image.nsfw ? <NudeNetTable nsfw={image.nsfw} /> : null}
          </div>
          {image.nsfw && image.nsfw.exposed_score < 0.2 && effectiveUnsafe(image, override) ? (
            <p className="text-caption leading-relaxed text-text-secondary">NudeNet scored no exposed class. SingGuard still marked the image unsafe under a policy.</p>
          ) : null}
          <PolicyReports image={image} override={override} />
          {onLabel ? (
            <TagControl
              cohorts={cohorts}
              auto={autoTags}
              label={label}
              caption={caption}
              saving={labelSaving}
              onChange={(tags) => {
                const fields = labelFields(label);
                delete fields.tags;
                onLabel(tags ? { ...fields, tags } : fields);
              }}
            />
          ) : null}
          {onLabel ? <LabelControl label={label} policies={policies} saving={labelSaving} error={labelError} onChange={onLabel} /> : null}
        </div>
      </div>
    </div>
  );
}
