export interface SseFrame {
  event: string;
  data: unknown;
}

/**
 * Split a byte stream into SSE frames, keeping a trailing partial frame.
 *
 * Lines may end in `\n`, `\r\n` or `\r` (the SSE spec allows all three). A `\r`
 * at the very end may be the first half of a `\r\n` split across chunks, so it
 * stays in `rest` until the next chunk says which it was. A frame whose data is
 * not JSON is dropped rather than failing the frames around it; an `error`
 * frame's raw text is kept as its `detail`, so the failure is still reported.
 */
export function parseSseFrames(buffer: string): { events: SseFrame[]; rest: string } {
  const events: SseFrame[] = [];
  const held = buffer.endsWith("\r") ? "\r" : "";
  let rest = (held ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, "\n");
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
    const text = dataLines.join("\n");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      if (event !== "error") continue;
      data = { detail: text };
    }
    events.push({ event, data });
  }
  return { events, rest: rest + held };
}
