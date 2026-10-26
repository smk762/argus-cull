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

function firedLetters(rules: string[]): Set<string> {
  const letters = new Set<string>();
  for (const rule of rules) {
    const letter = rule.trim().charAt(0).toUpperCase();
    if (/[A-G]/.test(letter)) letters.add(letter);
  }
  return letters;
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
