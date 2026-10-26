import type { FaceAttributes } from "./types";
import { slugLabel } from "./types";

/** One line for a card. Sources stay visible so a guess is not presented as a fact. */
export function attributeLine(attrs: FaceAttributes | null | undefined): string | null {
  if (!attrs) return null;
  const parts: string[] = [];
  if (attrs.race) parts.push(slugLabel(attrs.race));
  if (attrs.gender) parts.push(attrs.gender_source ? `${attrs.gender} (${attrs.gender_source})` : attrs.gender);
  if (attrs.age_years != null) {
    const years = `${Math.round(attrs.age_years)}y`;
    parts.push(attrs.age_source ? `${years} (${attrs.age_source})` : years);
  } else if (attrs.age) {
    parts.push(attrs.age_source ? `${attrs.age} (${attrs.age_source})` : attrs.age);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
