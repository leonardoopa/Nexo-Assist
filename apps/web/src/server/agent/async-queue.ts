/** A push-based queue that can be consumed with `for await`: the bridge between callbacks and a stream. */
export interface AsyncQueue<T> extends AsyncIterable<T> {
  push(item: T): void;
  close(): void;
}

export function createAsyncQueue<T>(): AsyncQueue<T> {
  const items: T[] = [];
  const waiting: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    push(item) {
      if (closed) return;
      const waiter = waiting.shift();
      if (waiter) waiter({ value: item, done: false });
      else items.push(item);
    },
    close() {
      closed = true;
      for (const waiter of waiting.splice(0)) waiter({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (items.length > 0) return Promise.resolve({ value: items.shift() as T, done: false });
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => waiting.push(resolve));
        },
      };
    },
  };
}
