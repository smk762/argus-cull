export interface SseFrame {
  event: string;
  data: unknown;
}

/** Split a byte stream into SSE frames, keeping a trailing partial frame. */
export function parseSseFrames(buffer: string): { events: SseFrame[]; rest: string } {
  const events: SseFrame[] = [];
  let rest = buffer;
  while (true) {
    const split = rest.indexOf("\n\n");
    if (split === -1) break;
    const raw = rest.slice(0, split);
    rest = rest.slice(split + 2);
    if (!raw.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length === 0) continue;
    events.push({ event, data: JSON.parse(dataLines.join("\n")) });
  }
  return { events, rest };
}
