import { describe, expect, it } from "vitest";

import { parseSseFrames } from "./sse";

describe("parseSseFrames", () => {
  it("reads frames whose lines end in CRLF", () => {
    const { events, rest } = parseSseFrames('event: progress\r\ndata: {"done":1}\r\n\r\nevent: chunk\r\ndata: {"n":2}\r\n\r\n');
    expect(events).toEqual([
      { event: "progress", data: { done: 1 } },
      { event: "chunk", data: { n: 2 } },
    ]);
    expect(rest).toBe("");
  });

  it("reads frames whose lines end in a bare CR", () => {
    const { events, rest } = parseSseFrames('event: complete\rdata: {"ok":true}\r\rdata');
    expect(events).toEqual([{ event: "complete", data: { ok: true } }]);
    expect(rest).toBe("data");
  });

  it("holds a CR at the end of a chunk until the next chunk says whether a LF follows", () => {
    const first = parseSseFrames('event: progress\r\ndata: {"done":1}\r\n\r');
    expect(first.events).toEqual([]);
    const second = parseSseFrames(first.rest + "\nevent: chunk\r\n");
    expect(second.events).toEqual([{ event: "progress", data: { done: 1 } }]);
    expect(second.rest).toBe("event: chunk\n");
  });

  it("drops a non-JSON frame without losing the frames around it", () => {
    const { events, rest } = parseSseFrames('data: {"a":1}\n\ndata: keepalive\n\nevent: complete\ndata: {"b":2}\n\npartial');
    expect(events).toEqual([
      { event: "message", data: { a: 1 } },
      { event: "complete", data: { b: 2 } },
    ]);
    expect(rest).toBe("partial");
  });

  it("keeps a non-JSON error frame's text as its detail", () => {
    const { events } = parseSseFrames("event: error\ndata: upstream timed out\n\n");
    expect(events).toEqual([{ event: "error", data: { detail: "upstream timed out" } }]);
  });
});
