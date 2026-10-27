"use client";

import type { PolicyChoice } from "@/lib/policies";

/** Which SingGuard policies the next scan runs. The official one drives the keep set; variants run beside it to compare. */
export function PolicyPicker({
  available,
  choice,
  disabled,
  onChange,
}: {
  available: readonly string[];
  choice: PolicyChoice;
  disabled: boolean;
  onChange: (choice: PolicyChoice) => void;
}) {
  if (available.length === 0) return null;
  const variants = available.filter((name) => name !== choice.policy);
  const extra = choice.variants.filter((name) => variants.includes(name)).length;
  return (
    <section className="space-y-2">
      <h3 className="font-display text-small font-semibold">SingGuard policy</h3>
      <label className="flex items-center justify-between gap-2 text-small">
        Official
        <select
          className="rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
          value={choice.policy}
          disabled={disabled}
          onChange={(event) => onChange({ policy: event.target.value, variants: choice.variants.filter((name) => name !== event.target.value) })}
        >
          {available.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {variants.length > 0 ? (
        <>
          <p className="text-caption text-text-muted">Also run, for comparison</p>
          <ul className="space-y-1">
            {variants.map((name) => {
              const checked = choice.variants.includes(name);
              return (
                <li key={name}>
                  <label className="flex items-center gap-2 text-small">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          policy: choice.policy,
                          variants: event.target.checked ? [...choice.variants, name] : choice.variants.filter((item) => item !== name),
                        })
                      }
                    />
                    {name}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-caption text-text-muted">
            {extra > 0
              ? `${extra + 1} SingGuard passes per image. A variant that flags where the official policy passes blurs the frame and shows in the detail view.`
              : "One SingGuard pass per image."}
          </p>
        </>
      ) : null}
    </section>
  );
}
