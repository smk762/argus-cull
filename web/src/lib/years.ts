/**
 * MiVOLO years to one decimal, cut off rather than rounded, so a reading the
 * under-18 rule treats as a minor never shows as 18: 17.96 is "17.9".
 */
export function formatYears(years: number): string {
  return (Math.floor(years * 10 + 1e-9) / 10).toFixed(1);
}
