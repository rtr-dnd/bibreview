// Concurrency-limited task pool. Generic over the payload type so the
// same machinery works for CrossRef searches and work-record fetches.

import { useCallback, useRef } from "react";

export type Task<T> = { id: string; payload: T };

export type TaskPool<T> = {
  enqueue: (tasks: Task<T>[]) => void;
  reset: () => void;
};

export function useTaskPool<T>(opts: {
  concurrency: number;
  run: (payload: T) => Promise<void>;
}): TaskPool<T> {
  const ref = useRef<{
    active: number;
    queue: Task<T>[];
    inflight: Set<string>;
  }>({ active: 0, queue: [], inflight: new Set() });

  const pump = useCallback(() => {
    const pool = ref.current;
    while (pool.active < opts.concurrency && pool.queue.length > 0) {
      const task = pool.queue.shift()!;
      pool.inflight.add(task.id);
      pool.active++;
      Promise.resolve()
        .then(() => opts.run(task.payload))
        .catch(() => {
          // The runner is responsible for surfacing its own errors; we just
          // ensure the pool keeps draining.
        })
        .finally(() => {
          pool.active--;
          pool.inflight.delete(task.id);
          pump();
        });
    }
  }, [opts]);

  const enqueue = useCallback(
    (tasks: Task<T>[]) => {
      const pool = ref.current;
      for (const t of tasks) {
        if (pool.inflight.has(t.id)) continue;
        if (pool.queue.some((q) => q.id === t.id)) continue;
        pool.queue.push(t);
      }
      pump();
    },
    [pump],
  );

  const reset = useCallback(() => {
    ref.current = { active: 0, queue: [], inflight: new Set() };
  }, []);

  return { enqueue, reset };
}
