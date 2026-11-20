/**
 * The scan to fetch once more when the poll of another tab's running scan
 * stops: the one that was being watched, if it is still the scan on screen and
 * it is no longer the active one. The poll's last summary is partial (the
 * final batches are missing and no policy is named until the scan ends), so
 * without that fetch the page would keep it until a reload.
 */
export function scanToRefetch(watched: string | null, activeScanId: string | null, viewScan: string | null, scanning: boolean): string | null {
  if (!watched || scanning || viewScan !== watched || activeScanId === watched) return null;
  return watched;
}
