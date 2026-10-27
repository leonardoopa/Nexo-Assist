import { describe, expect, it } from "vitest";

import { createAsyncQueue } from "./async-queue";

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of source) out.push(item);
  return out;
}

describe("createAsyncQueue", () => {
  it("delivers what was pushed before and after the consumer started, then ends", async () => {
    const queue = createAsyncQueue<number>();
    queue.push(1);
    const consumed = collect(queue);
    queue.push(2);
    await Promise.resolve();
    queue.push(3);
    queue.close();
    expect(await consumed).toEqual([1, 2, 3]);
  });

  it("ignores pushes after close and ends an idle consumer", async () => {
    const queue = createAsyncQueue<string>();
    const consumed = collect(queue);
    queue.close();
    queue.push("late");
    expect(await consumed).toEqual([]);
  });
});
