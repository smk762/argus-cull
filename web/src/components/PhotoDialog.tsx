"use client";

import { useEffect, useState } from "react";

import { attributeLine } from "@/lib/attributes";
import { imageUrl } from "@/lib/api";
import { isSensitive, nudeNetLabel } from "@/lib/moderation";
import { slugLabel, type ImageResult } from "@/lib/types";

export function PhotoDialog({
  image,
  scanId,
  reason,
  onClose,
}: {
  image: ImageResult;
  scanId: string;
  reason: string | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [shown, setShown] = useState(false);
  const attrs = image.primary_face_attributes;
  const worn = (image.garments ?? []).map((garment) => `${slugLabel(garment.label)} ${garment.conf.toFixed(2)}`);
  const blurred = isSensitive(image) && !shown;
  const nsfwLabels = Object.entries(image.nsfw?.labels ?? {});

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
          <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="relative overflow-hidden rounded-lg bg-base-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(scanId, image.rel_path)}
            alt={blurred ? "" : image.rel_path}
            className={`max-h-[70dvh] w-full object-contain ${blurred ? "scale-105 blur-3xl" : ""}`}
          />
          {blurred ? (
            <button
              type="button"
              className="absolute inset-0 m-auto h-fit w-fit rounded-md bg-base-800 px-4 py-2 text-small"
              onClick={() => setShown(true)}
            >
              Show image
            </button>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-2 text-small sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">Score</dt>
            <dd>{image.score.toFixed(3)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Selection</dt>
            <dd className={reason ? "text-warning" : "text-success"}>{reason === undefined ? "Selecting…" : reason || "keep"}</dd>
          </div>
          {image.primary_face_pose ? (
            <div>
              <dt className="text-text-muted">Head pose</dt>
              <dd>{image.primary_face_pose.replaceAll("_", " ")}</dd>
            </div>
          ) : null}
          {attrs ? (
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Appearance guess</dt>
              <dd>{attributeLine(attrs)}</dd>
              <dd className="text-caption text-text-muted">
                {attrs.gender_source ? `gender_source ${attrs.gender_source}` : "no gender source"}
                {" · "}
                {attrs.age_source ? `age_source ${attrs.age_source}` : "no age source"}
              </dd>
            </div>
          ) : null}
          {image.scene ? (
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Places365</dt>
              <dd>
                {image.scene.categories.map((category) => `${category.label} ${category.conf.toFixed(2)}`).join(", ")}
                {` · ${image.scene.environment}`}
              </dd>
            </div>
          ) : null}
          {worn.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Fashionpedia</dt>
              <dd>{worn.join(", ")}</dd>
            </div>
          ) : null}
          {image.nsfw ? (
            <div className="sm:col-span-2">
              <dt className="text-text-muted">NudeNet</dt>
              <dd>exposed {image.nsfw.exposed_score.toFixed(2)}</dd>
              {nsfwLabels.length > 0 ? (
                <dd className="text-caption text-text-muted">
                  {nsfwLabels.map(([label, score]) => `${nudeNetLabel(label)} ${score.toFixed(2)}`).join(", ")}
                </dd>
              ) : null}
            </div>
          ) : null}
          {image.guard ? (
            <div className="sm:col-span-2">
              <dt className="text-text-muted">SingGuard</dt>
              <dd>
                {image.guard.safe ? "safe" : "unsafe"}
                {image.guard.rules.length > 0 ? ` · ${image.guard.rules.join(", ")}` : ""}
                {image.guard.policy ? ` · ${image.guard.policy}` : ""}
              </dd>
              {image.guard.explanation ? <dd className="text-caption text-text-muted">{image.guard.explanation}</dd> : null}
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
