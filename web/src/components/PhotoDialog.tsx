"use client";

import { useEffect, useState, type ReactNode } from "react";

import { imageUrl, thumbUrl } from "@/lib/api";
import { ageMissing, awaitingChecks, bodyAges, DEFAULT_BLUR, isMinorExposed, measuredAges, revealHeld, shouldBlur, shownAge, usesSetAge, youngestAge, type BlurPolicy } from "@/lib/chunks";
import { effectiveTags, EMPTY_COHORTS, type Caption, type CohortConfig, type CohortRule } from "@/lib/cohorts";
import { confLine, nsfwSource, nudeNetLine, qualityLine, sceneLine } from "@/lib/detailLines";
import { cascadePath, displayGuardExplanation, splitGuardExplanation } from "@/lib/guardText";
import { EXPECT_LABELS, EXPECTS, type ImageLabel } from "@/lib/labels";
import { DOCS } from "@/lib/docsLinks";
import { contentRating, nudeNetLabel } from "@/lib/moderation";
import { effectiveUnsafe, policyVerdicts, shieldLabel, shieldState, shieldTitle } from "@/lib/policies";
import { formatYears } from "@/lib/years";
import { NUDENET_LABELS, slugLabel, type EraxResult, type FaceAttributes, type GuardResult, type ImageResult, type NsfwResult } from "@/lib/types";

import { NotInDemo } from "./DemoBadge";
import { DocLink } from "./DocLink";
import { closeModal, Modal } from "./Modal";
import { Shield } from "./Shield";

const SCORE_PARTS: [string, string][] = [
  ["sharpness", "Sharpness"],
  ["resolution", "Resolution"],
  ["artifact", "Artifact"],
  ["target_bonus", "Target bonus"],
  ["face_penalty", "Face penalty"],
];

type Row = [label: ReactNode, value: ReactNode, note?: ReactNode];

/** A two- or three-column key/value table. Null rows are skipped so callers can inline conditions. No title inside a fold, whose summary line names it. */
function StatTable({ title, rows, caption }: { title?: string; rows: (Row | null)[]; caption?: ReactNode }) {
  const shown = rows.filter((row): row is Row => row != null);
  if (shown.length === 0) return null;
  const notes = shown.some((row) => row[2] != null);
  return (
    <section>
      {title ? <h3 className="text-caption text-text-muted">{title}</h3> : null}
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
function ConfTable({ title, rows, caption }: { title?: string; rows: { label: string; conf: number }[]; caption?: ReactNode }) {
  if (rows.length === 0 && !caption) return null;
  return (
    <section>
      {title ? <h3 className="text-caption text-text-muted">{title}</h3> : null}
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
      rows={[
        ["Score", <span key="score" className="font-semibold">{image.score.toFixed(3)}</span>, image.reject_reason ? image.reject_reason : undefined],
        ...SCORE_PARTS.filter(([key]) => breakdown[key] != null).map(([key, label]): Row => [label, breakdown[key].toFixed(3)]),
        ...extra.map(([key, value]): Row => [key.replaceAll("_", " "), value.toFixed(3)]),
        ["Size", `${image.width}×${image.height}`],
        image.crop
          ? [
              "Cropped",
              `${image.crop.left},${image.crop.top} – ${image.crop.right},${image.crop.bottom}`,
              image.crop_source === "detected" ? "Watermark found and cut away; every check saw the cropped frame" : "Box given by hand; every check saw the cropped frame",
            ]
          : null,
        image.watermarks != null
          ? ["Watermarks", image.watermarks.length === 0 ? "none found" : image.watermarks.map((hit) => `${hit.label} ${hit.score.toFixed(2)}`).join(", ")]
          : null,
        ["Sharpness, raw", image.sharpness.toFixed(1)],
        image.artifact_score != null ? ["Artifact, raw", image.artifact_score.toFixed(2)] : null,
      ]}
    />
  );
}

function AppearanceTable({ image }: { image: ImageResult }) {
  const attrs: FaceAttributes | null = image.primary_face_attributes;
  const youngest = youngestAge(image);
  const faceCount = image.faces?.length ?? 0;
  const setAge = usesSetAge(image) ? image.set_age : null;
  const bodies = bodyAges(image);
  const people = peopleCheckRow(image);
  if (!attrs && !image.primary_face_pose && faceCount === 0 && !setAge && bodies.length === 0 && !people) return null;
  // The age row is the youngest face or body-only person, the one the under-18 rule reads. The primary face gets its own row when it reads older.
  const primaryYears = attrs?.age_source === "mivolo" || attrs?.age_source == null ? attrs?.age_years ?? null : null;
  const age = !setAge && youngest != null ? `${formatYears(youngest)} years` : attrs?.age ?? null;
  const agedFaces = measuredAges(image).length;
  const youngestIsBody = bodies.length > 0 && youngest != null && youngest === Math.min(...bodies);
  return (
    <StatTable
      title="Appearance guess"
      rows={[
        setAge
          ? [
              "Age of the set",
              `about ${formatYears(setAge.years)} years`,
              `no face in this frame; median of ${setAge.faces} MiVOLO faces in ${setAge.cluster_id} (${Math.round(setAge.share * 100)}% of the scan's faces)`,
            ]
          : null,
        attrs?.gender ? ["Gender", attrs.gender, [attrs.gender_source, attrs.gender_conf != null ? attrs.gender_conf.toFixed(2) : null].filter(Boolean).join(" · ")] : null,
        age
          ? [
              "Age",
              age,
              youngest != null && !setAge
                ? youngestIsBody
                  ? "mivolo · body only, a person with no visible face"
                  : agedFaces > 1
                  ? `mivolo · youngest of ${agedFaces} faces`
                  : [attrs?.age_source ?? "mivolo", attrs?.age_conf != null ? attrs.age_conf.toFixed(2) : null].filter(Boolean).join(" · ")
                : [attrs?.age_source, attrs?.age_conf != null ? attrs.age_conf.toFixed(2) : null].filter(Boolean).join(" · "),
            ]
          : null,
        youngest != null && primaryYears != null && primaryYears > youngest ? ["Primary face", `${formatYears(primaryYears)} years`, "mivolo · the face the gender reads from"] : null,
        bodies.length > 0
          ? ["No visible face", bodies.map((years) => `${formatYears(years)} years`).join(", "), `mivolo · read from the body alone; ${bodies.length === 1 ? "one person" : `${bodies.length} people`} the face detector missed`]
          : null,
        people,
        image.primary_face_pose ? ["Head pose", image.primary_face_pose.replaceAll("_", " ")] : null,
        faceCount > 1 ? ["Faces", String(faceCount)] : null,
      ]}
      caption="Age is the youngest face or body-only person in the frame, the one the under-18 check reads; gender comes from the primary face. Sources are named so a guess is not read as a fact."
    />
  );
}

/** The person check failed, so an empty list of people is not "nobody without a face". Null when it ran clean or was not asked for. */
function peopleCheckRow(image: ImageResult): Row | null {
  if (image.people_check == null || image.people_check === "ok") return null;
  const what = image.people_check === "detection_failed" ? "Person detector failed; faces only" : "Body-only ages failed";
  return ["People check", <span key="people" className="text-warning">{what}</span>, image.people_error ?? undefined];
}

function NudeNetTable({ nsfw, rating, source, erax }: { nsfw: NsfwResult; rating: ReturnType<typeof contentRating>; source: string | null; erax: EraxResult | null }) {
  const eraxLabels = erax ? Object.entries(erax.labels).sort(([, left], [, right]) => right - left) : [];
  const detected = NUDENET_LABELS.filter((label) => nsfw.labels[label] != null).sort((left, right) => nsfw.labels[right] - nsfw.labels[left]);
  const quiet = NUDENET_LABELS.filter((label) => nsfw.labels[label] == null);
  return (
    <section>
      <table className="mt-1 w-full border-collapse text-small tabular-nums">
        <tbody>
          {rating ? (
            <tr>
              <th scope="row" className="w-2/5 py-1 pr-3 text-left font-normal text-text-secondary">
                Content rating
              </th>
              <td className="py-1 font-semibold capitalize">{rating}</td>
            </tr>
          ) : null}
          <tr>
            <th scope="row" className="w-2/5 py-1 pr-3 text-left font-normal text-text-secondary">
              Exposed score
            </th>
            <td className="py-1 font-semibold">{nsfw.exposed_score.toFixed(2)}</td>
          </tr>
          {source ? (
            <tr>
              <th scope="row" className="w-2/5 py-1 pr-3 text-left font-normal text-text-secondary">
                Source
              </th>
              <td className="py-1 text-warning">{source}</td>
            </tr>
          ) : null}
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
        {source ? " EraX's classes are mapped onto NudeNet's; EraX has no buttocks class, so the frame stays blurred when NudeNet failed." : ""}
      </p>
      {eraxLabels.length > 0 ? (
        <table className="mt-2 w-full border-collapse text-small tabular-nums">
          <caption className="text-left text-caption text-text-muted">EraX-NSFW, its own classes</caption>
          <tbody>
            {eraxLabels.map(([label, score]) => (
              <tr key={label} className="border-t border-base-700">
                <td className="py-1 pr-3">{label.replaceAll("_", " ")}</td>
                <td className="py-1">{score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function GuardReport({ guard }: { guard: GuardResult }) {
  const steps = splitGuardExplanation(displayGuardExplanation(guard.explanation ?? ""), guard.rules);
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
  const cascaded = verdicts.some((verdict) => cascadePath(verdict.result.explanation));
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
            const notes = [verdict.official ? "official" : null, override === verdict.policy ? "shield follows this" : null, differs ? "differs from official" : null].filter(Boolean);
            return (
              <tr key={verdict.policy} className="border-t border-base-700">
                <td className="py-1 pr-3">{verdict.policy}</td>
                <td className={`py-1 pr-3 ${verdict.result.safe ? "text-success" : "text-warning"}`}>{verdict.result.safe ? "Safe" : "Unsafe"}</td>
                <td className="py-1 pr-3">{verdict.result.safe ? <span className="text-text-muted">–</span> : verdict.result.rules.join(", ")}</td>
                <td className="py-1 text-caption text-text-muted">{notes.join(" · ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {cascaded ? (
        <p className="mt-2 text-caption leading-relaxed text-text-muted">Fast flagged this for a closer look; the slow pass is the verdict.</p>
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
      <FoldDocs title="SingGuard" docs={[{ href: DOCS.policyCheck, text: "Policy check" }, { href: DOCS.moderation, text: "Moderation and its limits" }]} />
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
/** A doc link a fold ends with: what the numbers in it mean, in the curator docs. */
type FoldDoc = { href: string; text: string };

function Fold({ title, summary, open, docs = [], children }: { title: string; summary: string | null; open: boolean; docs?: FoldDoc[]; children: ReactNode }) {
  return (
    <details open={open} className="border-t border-base-700 pt-3">
      <summary className="cursor-pointer text-caption text-text-muted">
        {title}
        {summary ? <span className="text-text-secondary"> · {summary}</span> : null}
      </summary>
      {children}
      <FoldDocs title={title} docs={docs} />
    </details>
  );
}

function FoldDocs({ title, docs }: { title: string; docs: FoldDoc[] }) {
  if (docs.length === 0) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 text-caption">
      {docs.map((doc) => (
        <DocLink key={doc.href} href={doc.href} label={`${title}: ${doc.text}`}>
          {doc.text}
        </DocLink>
      ))}
    </p>
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
function Summary({
  image,
  reason,
  override,
  checking,
  scanning,
  pending,
  facesRan,
}: {
  image: ImageResult;
  reason: string | undefined;
  override: string | null;
  checking: boolean;
  /** The scan is still running, so there is no keep set to report yet. */
  scanning: boolean;
  pending: readonly string[];
  facesRan: boolean;
}) {
  const shown = shownAge(image);
  const age = shown ? <span title={shown.title}>{shown.text}</span> : ageMissing(image, pending, facesRan);
  const state = shieldState(image, override);
  const cells: [string, ReactNode][] = [
    [
      "Selection",
      <span key="sel" className={reason === undefined ? "text-text-muted" : reason ? "text-warning" : "text-success"}>
        {reason === undefined ? (scanning ? "after the scan" : "Selecting…") : reason || "keep"}
      </span>,
    ],
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

function PhotoPanel({
  image,
  scanId,
  reason,
  pending,
  facesRan = false,
  scanning = false,
  blur = DEFAULT_BLUR,
  onDelete,
  deleteOff = null,
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
  /** Face detection reported on this scan, so a frame with none says "no face" rather than "–". */
  facesRan?: boolean;
  /** The scan is still running, so there is no keep set to report yet. */
  scanning?: boolean;
  blur?: BlurPolicy;
  onClose: () => void;
  onDelete: () => Promise<void>;
  /** The static demo: Delete shows, disabled, with this reason. */
  deleteOff?: string | null;
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
      // Arrows move the caret or the choice in the label fields, not the photo.
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, select, textarea"))) return;
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
  }, [onPrevious, onNext]);

  const [shown, setShown] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const worn = (image.garments ?? []).map((garment) => ({ label: slugLabel(garment.label), conf: garment.conf }));
  const blocked = isMinorExposed(image);
  const checking = awaitingChecks(image, pending);
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

  return (
    <>
      {/* Phones: the name on its own line, the buttons wrapping under it. */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <h2 id="photo-title" className="min-w-0 basis-full font-display text-subheading break-all sm:basis-auto">
          {image.rel_path}
        </h2>
        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
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
              disabled={deleting || deleteOff != null}
              title={deleteOff ?? undefined}
              onClick={() => void remove()}
            >
              {deleting ? "Deleting…" : confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          ) : obscured && !holdReveal ? (
            <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small" onClick={() => setShown((open) => !open)}>
              {shown ? "Blur" : "Unblur"}
            </button>
          ) : null}
          <button type="button" className="rounded-md border border-base-600 px-3 py-1 text-small" onClick={closeModal}>
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
        <Summary image={image} reason={reason} override={override} checking={checking} scanning={scanning} pending={pending} facesRan={facesRan} />
        {blocked ? (
          <p className="text-caption text-warning">
            {deleteError ?? "Delete removes this file from the source folder. Review the ages and scores in this panel first."}
          </p>
        ) : null}
        {blocked && deleteOff ? <NotInDemo reason={deleteOff} /> : null}
        <AppearanceTable image={image} />
        {/* The numbers the summary strip already gives are folded: the strip says how much, these say why. */}
        <Fold title="Quality" summary={qualityLine(image)} open={false} docs={[{ href: DOCS.quality, text: "How scoring works" }]}>
          <QualityTable image={image} />
        </Fold>
        {image.nsfw ? (
          <Fold
            title="NudeNet"
            summary={nudeNetLine(image.nsfw, contentRating(image), nsfwSource(image))}
            open={false}
            docs={[{ href: DOCS.nudity, text: "Nudity detection" }, ...(image.erax ? [{ href: DOCS.erax, text: "EraX" }] : []), { href: DOCS.moderation, text: "Moderation and its limits" }]}
          >
            <NudeNetTable nsfw={image.nsfw} rating={contentRating(image)} source={nsfwSource(image)} erax={image.erax ?? null} />
          </Fold>
        ) : null}
        {image.scene ? (
          <Fold title="Places365" summary={sceneLine(image.scene.categories, image.scene.environment)} open={false} docs={[{ href: DOCS.scenes, text: "Scene tags" }]}>
            <ConfTable rows={image.scene.categories.map((category) => ({ label: category.label, conf: category.conf }))} caption={`Environment: ${image.scene.environment}`} />
          </Fold>
        ) : null}
        {worn.length > 0 ? (
          <Fold title="Fashionpedia" summary={confLine(worn)} open={false} docs={[{ href: DOCS.wardrobe, text: "Garments" }]}>
            <ConfTable rows={worn} />
          </Fold>
        ) : null}
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
    </>
  );
}

/**
 * The photo modal. The dialog stays open across Previous and Next and only the
 * panel inside remounts per image (resetting its reveal and delete state), so
 * the opener focus returns to on close is the grid tile, not the page body.
 */
export function PhotoDialog(props: Parameters<typeof PhotoPanel>[0]) {
  return (
    <Modal labelledBy="photo-title" className="max-w-5xl p-4" onClose={props.onClose}>
      <PhotoPanel key={props.image.rel_path} {...props} />
    </Modal>
  );
}
