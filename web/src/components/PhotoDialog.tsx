"use client";

import { useEffect, useState } from "react";

import { attributeLine } from "@/lib/attributes";
import { imageUrl, thumbUrl } from "@/lib/api";
import { DEFAULT_BLUR, isMinorExposed, revealHeld, shouldBlur, type BlurPolicy } from "@/lib/chunks";
import { effectiveTags, EMPTY_COHORTS, type Caption, type CohortConfig, type CohortRule } from "@/lib/cohorts";
import { splitGuardExplanation } from "@/lib/guardText";
import { EXPECT_LABELS, EXPECTS, type ImageLabel } from "@/lib/labels";
import { nudeNetLabel } from "@/lib/moderation";
import { dissentingPolicies, effectiveUnsafe, policyVerdicts } from "@/lib/policies";
import { NUDENET_LABELS, slugLabel, type GuardResult, type ImageResult, type NsfwResult } from "@/lib/types";

const SCORE_PARTS: [string, string][] = [
  ["sharpness", "Sharpness"],
  ["resolution", "Resolution"],
  ["artifact", "Artifact"],
  ["target_bonus", "Target bonus"],
  ["face_penalty", "Face penalty"],
];

function NudeNetReport({ nsfw }: { nsfw: NsfwResult }) {
  const detected = NUDENET_LABELS.filter((label) => nsfw.labels[label] != null);
  const quiet = NUDENET_LABELS.filter((label) => nsfw.labels[label] == null);
  return (
    <section className="border-t border-base-700 pt-3">
      <h3 className="text-caption text-text-muted">NudeNet score</h3>
      <p>{nsfw.exposed_score.toFixed(2)}</p>
      <p className="text-caption text-text-muted">Highest score among the five exposed classes. Other classes do not raise it. This is not the quality score.</p>
      {detected.length > 0 ? (
        <ul className="mt-2 grid gap-x-4 sm:grid-cols-2">
          {detected.map((label) => (
            <li key={label}>
              {nudeNetLabel(label)} {nsfw.labels[label].toFixed(2)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-caption text-text-muted">No class scored 0.2 or above.</p>
      )}
      {quiet.length > 0 && detected.length > 0 ? (
        <p className="mt-2 text-caption leading-relaxed text-text-muted">Under 0.2: {quiet.map((label) => nudeNetLabel(label)).join(", ")}</p>
      ) : null}
    </section>
  );
}

function GuardReport({ guard }: { guard: GuardResult }) {
  const steps = splitGuardExplanation(guard.explanation ?? "", guard.rules);
  return (
    <>
      {guard.rules.length > 0 ? <p className="mt-1">{guard.rules.join(", ")}</p> : null}
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
    </>
  );
}

/** One collapsible section per policy that judged the image. The official one and any that disagree with it start open. */
function PolicyReports({ image, override }: { image: ImageResult; override: string | null }) {
  const verdicts = policyVerdicts(image);
  if (verdicts.length === 0) return null;
  const union = effectiveUnsafe(image);
  const followed = effectiveUnsafe(image, override);
  const dissent = new Set(dissentingPolicies(image));
  return (
    <section className="border-t border-base-700 pt-3">
      <h3 className="text-caption text-text-muted">SingGuard</h3>
      {verdicts.length > 1 ? (
        <p className={followed ? "text-warning" : "text-success"}>
          {followed ? "Unsafe" : "Safe"}
          {override ? ` · following ${override}` : union ? ` · ${verdicts.filter((verdict) => !verdict.result.safe).map((verdict) => verdict.policy).join(", ")} flagged` : " · every policy passed"}
        </p>
      ) : null}
      <div className="mt-2 space-y-2">
        {verdicts.map((verdict) => (
          <details key={verdict.policy} open={verdict.official || dissent.has(verdict.policy) || override === verdict.policy} className="rounded-md border border-base-700 px-3 py-2">
            <summary className="cursor-pointer text-small">
              <span className={verdict.result.safe ? "text-success" : "text-warning"}>{verdict.result.safe ? "Safe" : "Unsafe"}</span>
              {` · ${verdict.policy}`}
              {verdict.official ? <span className="text-text-muted"> · official</span> : null}
              {dissent.has(verdict.policy) ? <span className="text-warning"> · differs</span> : null}
              {override === verdict.policy ? <span className="text-accent-tertiary"> · shield follows this</span> : null}
            </summary>
            <GuardReport guard={verdict.result} />
          </details>
        ))}
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
  return (
    <section className="border-t border-base-700 pt-3">
      <h3 className="text-caption text-text-muted">Label{saving ? " · saving" : ""}</h3>
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
    </section>
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
  return (
    <section className="border-t border-base-700 pt-3">
      <h3 className="text-caption text-text-muted">
        Setting and wardrobe{byHand ? " · set by hand" : auto.length > 0 ? " · automatic" : ""}
        {saving ? " · saving" : ""}
      </h3>
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
    </section>
  );
}

function scoreLines(breakdown: Record<string, number> | undefined): string[] {
  if (!breakdown) return [];
  const known = new Set(SCORE_PARTS.map(([key]) => key));
  const lines = SCORE_PARTS.filter(([key]) => breakdown[key] != null).map(([key, label]) => `${label} ${breakdown[key].toFixed(3)}`);
  for (const [key, value] of Object.entries(breakdown)) {
    if (!known.has(key)) lines.push(`${key.replaceAll("_", " ")} ${value.toFixed(3)}`);
  }
  return lines;
}

export function PhotoDialog({
  image,
  scanId,
  reason,
  pending,
  scanning = false,
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
  /** The scan is still running, so there is no keep set to report yet. */
  scanning?: boolean;
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
  const attrs = image.primary_face_attributes;
  const otherRaces = (image.faces ?? [])
    .filter((face) => !face.primary && face.attributes?.race && face.attributes.race !== attrs?.race)
    .map((face) => slugLabel(face.attributes?.race ?? ""));
  const worn = (image.garments ?? []).map((garment) => `${slugLabel(garment.label)} ${garment.conf.toFixed(2)}`);
  const blocked = isMinorExposed(image);
  // No reveal while the under-18 rule could still apply: NudeNet has not reported, or the ages are still coming.
  const holdReveal = revealHeld(image, pending);
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
  const parts = scoreLines(image.score_breakdown);

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
            <p className="absolute inset-0 m-auto h-fit w-fit rounded-md bg-base-800 px-4 py-2 text-small">Scanning…</p>
          ) : null}
          {blocked ? (
            <p className="absolute inset-x-4 bottom-4 rounded-md bg-base-800 px-3 py-2 text-caption text-text-secondary">
              MiVOLO reads a face as under 18 and NudeNet reported an exposed score of at least 0.2. This photo stays blurred and will not be kept.
            </p>
          ) : null}
        </div>
        <div className="mt-4 space-y-4 text-small">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-caption text-text-muted">Quality score</dt>
              <dd>{image.score.toFixed(3)}{image.reject_reason ? ` · ${image.reject_reason}` : ""}</dd>
              {parts.length > 0 ? <dd className="text-caption leading-relaxed text-text-muted">{parts.join(" · ")}</dd> : null}
              <dd className="text-caption text-text-muted">
                {image.width}×{image.height}
                {` · sharpness ${image.sharpness.toFixed(1)}`}
                {image.artifact_score != null ? ` · artifact ${image.artifact_score.toFixed(2)}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">Selection</dt>
              <dd className={reason ? "text-warning" : "text-success"}>{reason === undefined ? (scanning ? "after the scan" : "Selecting…") : reason || "keep"}</dd>
            </div>
            {image.primary_face_pose ? (
              <div>
                <dt className="text-caption text-text-muted">Head pose</dt>
                <dd>{image.primary_face_pose.replaceAll("_", " ")}</dd>
              </div>
            ) : null}
          </dl>
          {blocked ? (
            <p className="text-caption text-warning">
              {deleteError ?? "Delete removes this file from the source folder. Review the ages and scores in this panel first."}
            </p>
          ) : null}
          {attrs ? (
            <section>
              <h3 className="text-caption text-text-muted">Appearance guess</h3>
              <p>{attributeLine(attrs)}</p>
              <p className="text-caption text-text-muted">
                {attrs.gender_source ? `gender_source ${attrs.gender_source}` : "no gender source"}
                {" · "}
                {attrs.age_source ? `age_source ${attrs.age_source}` : "no age source"}
              </p>
            </section>
          ) : null}
          <section>
            <h3 className="text-caption text-text-muted">Race</h3>
            {attrs?.race ? (
              <p>
                {slugLabel(attrs.race)}
                {attrs.race_conf != null ? ` ${attrs.race_conf.toFixed(2)}` : ""}
                {" · FairFace"}
              </p>
            ) : (
              <p className="text-caption text-text-muted">No race recorded. FairFace is the only model that records race.</p>
            )}
            {otherRaces.length > 0 ? <p className="text-caption text-text-muted">Other faces: {otherRaces.join(", ")}</p> : null}
          </section>
          {image.scene ? (
            <section>
              <h3 className="text-caption text-text-muted">Places365</h3>
              <p className="leading-relaxed">
                {image.scene.categories.map((category) => `${category.label} ${category.conf.toFixed(2)}`).join(", ")}
                {` · ${image.scene.environment}`}
              </p>
            </section>
          ) : null}
          {worn.length > 0 ? (
            <section>
              <h3 className="text-caption text-text-muted">Fashionpedia</h3>
              <p className="leading-relaxed">{worn.join(", ")}</p>
            </section>
          ) : null}
          {image.nsfw ? <NudeNetReport nsfw={image.nsfw} /> : null}
          {image.nsfw && image.nsfw.exposed_score < 0.2 && effectiveUnsafe(image, override) ? (
            <p className="text-caption leading-relaxed text-text-secondary">
              NudeNet scored no exposed class. SingGuard still marked the image unsafe under its policy.
            </p>
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
