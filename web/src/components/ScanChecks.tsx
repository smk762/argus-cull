"use client";

import type { Detectors } from "@/lib/types";

/**
 * Local checks the next scan can leave out. Only Fashionpedia so far: it is
 * the slowest local model and nothing else in the scan waits on it, so a
 * scan that does not need the wardrobe filters runs faster without it. The
 * choice lives in the URL like the policy, so a shared link scans the same way.
 */
export function ScanChecks({
  detectors,
  skipGarments,
  disabled,
  onSkipGarments,
}: {
  detectors: Detectors | null;
  skipGarments: boolean;
  disabled: boolean;
  onSkipGarments: (skip: boolean) => void;
}) {
  if (!detectors?.garments) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-display text-small font-semibold">Scan checks</h2>
      <label className="flex items-center gap-2 text-small">
        <input type="checkbox" checked={!skipGarments} disabled={disabled} onChange={(event) => onSkipGarments(!event.target.checked)} />
        Garments (Fashionpedia)
      </label>
      <p className="text-caption text-text-muted">{skipGarments ? "The next scan skips garment detection, so the wardrobe filters stay empty for it." : "The slowest local check. Turn it off when the wardrobe filters are not needed."}</p>
    </section>
  );
}
