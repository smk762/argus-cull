"use client";

import { useEffect, useState } from "react";

import { attributeLine } from "@/lib/attributes";
import { imageUrl, thumbUrl } from "@/lib/api";
import { DEFAULT_BLUR, isMinorExposed, minorAwaitingNude, shouldBlur, type BlurPolicy } from "@/lib/chunks";
import { splitGuardExplanation } from "@/lib/guardText";
import { nudeNetLabel } from "@/lib/moderation";
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
    <section className="border-t border-base-700 pt-3">
      <h3 className="text-caption text-text-muted">SingGuard</h3>
      <p className={guard.safe ? "text-success" : "text-warning"}>
        {guard.safe ? "Safe" : "Unsafe"}
        {guard.policy ? ` · ${guard.policy}` : ""}
      </p>
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
  blur = DEFAULT_BLUR,
  onClose,
  onDelete,
  onPrevious,
  onNext,
  position,
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
  const holdReveal = blocked || minorAwaitingNude(image, pending);
  const obscured = shouldBlur(image, pending, blur);
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
            <p className="absolute inset-0 m-auto h-fit w-fit rounded-md bg-base-800 px-4 py-2 text-small">Checking</p>
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
              <dd className={reason ? "text-warning" : "text-success"}>{reason === undefined ? "Selecting…" : reason || "keep"}</dd>
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
          {image.nsfw && image.guard && image.nsfw.exposed_score < 0.2 && !image.guard.safe ? (
            <p className="text-caption leading-relaxed text-text-secondary">
              NudeNet scored no exposed class. SingGuard still marked the image unsafe under its policy.
            </p>
          ) : null}
          {image.guard ? <GuardReport guard={image.guard} /> : null}
        </div>
      </div>
    </div>
  );
}
