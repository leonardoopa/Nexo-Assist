import { describe, expect, it } from "vitest";

import type { TurnEvent } from "@/server/chat/events";

import { readEvents } from "./ndjson";

function streamOf(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of readEvents(stream)) events.push(event);
  return events;
}

const lines = [
  { type: "text", delta: "Olá, açaí 😀 — tudo bem?" },
  { type: "step_start", id: "a-1", tool: "search_help_center", label: "buscando na central de ajuda" },
  { type: "done" },
];
const payload = new TextEncoder().encode(`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);

describe("readEvents", () => {
  it.each([1, 2, 3, 7, 50, 10_000])("rebuilds every event when the stream is cut every %i bytes", async (size) => {
    expect(await collect(streamOf(payload, size))).toEqual(lines);
  });

  it("reads a last line that has no trailing newline and skips blank lines", async () => {
    const bytes = new TextEncoder().encode(`\n${JSON.stringify(lines[0])}\n\n${JSON.stringify(lines[2])}`);
    expect(await collect(streamOf(bytes, 5))).toEqual([lines[0], lines[2]]);
  });
});
