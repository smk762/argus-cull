export interface GuardRuleLine {
  letter: string;
  name: string;
  detail: string;
  fired: boolean;
}

export interface GuardStep {
  title: string;
  paragraphs: string[];
  rules: GuardRuleLine[];
}

const RULE_LINE = /^\s*-\s*([A-G])\.\s+([^:]+):\s*(.*)$/;
const CASCADE_HEAD = /Cascade:\s*fast flagged this;\s*the slow pass is the verdict\.?/i;
const PARSER_NOTES = [
  /SingGuard did not give a safe or unsafe verdict\.\s*The check is unsafe so an unreadable result is not treated as safe\.?/i,
  /SingGuard's reply ended before (?:its <answer>|a Final Judgment or <answer>)[\s\S]*?\.\s*The check is unsafe so an incomplete result is not treated as safe\.?/i,
  /The first line says unsafe, but the answer is Safe\.\s*Those signals disagree, so the check is unsafe\.?/i,
  /The first line says safe, but the answer names [\s\S]*?\.\s*Those signals disagree, so the check is unsafe\.?/i,
];
const CONCLUSION =
  /\b(?:therefore[,:]?\s+)?(?:(?:the\s+)?(?:content|image)\s+is|it\s+is(?:\s+classified\s+as)?|classified\s+as|conclude[sd]?|final judgment[:\s]+)\s+(safe|unsafe)\b/gi;
const LATE_LINE = /^\s*\**\s*(safe|unsafe)\s*\**\s*[.!]?\s*$/i;

function firedLetters(rules: string[]): Set<string> {
  const letters = new Set<string>();
  for (const rule of rules) {
    const letter = rule.trim().charAt(0).toUpperCase();
    if (/[A-G]/.test(letter)) letters.add(letter);
  }
  return letters;
}

/** True when the writeup is a cascade: fast flagged, then slow judged. */
export function cascadePath(explanation: string | null | undefined): boolean {
  return Boolean(explanation && CASCADE_HEAD.test(explanation));
}

/** Drop the cascade header and fail-closed parser notes; the steps are the result. */
export function displayGuardExplanation(explanation: string): string {
  let text = explanation.replace(CASCADE_HEAD, "");
  for (const note of PARSER_NOTES) text = text.replace(note, "");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function judgmentSection(text: string): string | null {
  const start = text.search(/\[Step 3\]/i);
  if (start < 0) return null;
  let rest = text.slice(start);
  const next = rest.search(/\n\[Step \d+\]/i);
  if (next >= 0) rest = rest.slice(0, next);
  return rest.replace(/^\[Step 3\][^\n]*/i, "").trim();
}

/** The deeper pass's conclusion, or null when Step 3 does not say safe or unsafe. */
export function finalJudgment(explanation: string | null | undefined): "safe" | "unsafe" | null {
  if (!explanation) return null;
  const section = judgmentSection(explanation);
  if (!section) return null;
  let found: "safe" | "unsafe" | null = null;
  for (const match of section.matchAll(CONCLUSION)) {
    found = match[1].toLowerCase() as "safe" | "unsafe";
  }
  if (found) return found;
  const lines = section.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const late = lines[i].match(LATE_LINE);
    if (late) return late[1].toLowerCase() as "safe" | "unsafe";
  }
  return null;
}

/** Split a SingGuard writeup into steps, and the checklist under a step into rule lines. */
export function splitGuardExplanation(explanation: string, firedRules: string[] = []): GuardStep[] {
  const text = explanation.trim();
  if (!text) return [];
  const fired = firedLetters(firedRules);
  const chunks = text.split(/(?=\[Step \d+\])/).map((chunk) => chunk.trim()).filter(Boolean);
  if (!chunks.some((chunk) => chunk.startsWith("[Step"))) {
    return [{ title: "Explanation", paragraphs: text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean), rules: [] }];
  }
  return chunks.map((chunk) => {
    const lines = chunk.split("\n");
    const title = lines[0].replace(/^\[Step \d+\]\s*/, "").trim() || lines[0];
    const paragraphs: string[] = [];
    const rules: GuardRuleLine[] = [];
    let buffer: string[] = [];
    const flush = () => {
      const paragraph = buffer.join(" ").trim();
      if (paragraph) paragraphs.push(paragraph);
      buffer = [];
    };
    for (const line of lines.slice(1)) {
      const rule = line.match(RULE_LINE);
      if (rule) {
        flush();
        rules.push({ letter: rule[1], name: rule[2].trim(), detail: rule[3].trim(), fired: fired.has(rule[1]) });
      } else if (line.trim() === "") {
        flush();
      } else {
        buffer.push(line.trim());
      }
    }
    flush();
    return { title, paragraphs, rules };
  });
}
