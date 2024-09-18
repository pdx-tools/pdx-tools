type QueueResult<T> = { kind: "cancelled" } | { kind: "success"; data: T };
type Task = {
  cancel: () => void;
  run: () => Promise<void>;
};

/**
 * A queue that runs tasks one at a time. Every new task added to the queue will
 * cancel any tasks that have not yet started.
 */
export function throttleQueue<T, ARGS extends any[]>({
  work,
}: {
  work: (...opts: ARGS) => Promise<T>;
}) {
  let nextTask: undefined | Task;
  let running = false;

  const runJob = async (...args: ARGS): Promise<QueueResult<T>> => {
    running = true;
    try {
      const result = await work(...args);
      return { data: result, kind: "success" };
    } finally {
      running = false;
      nextTask?.run();
      nextTask = undefined;
    }
  };

  return {
    async run(...args: ARGS) {
      if (running) {
        return new Promise<QueueResult<T>>((res) => {
          nextTask?.cancel();
          nextTask = {
            cancel: () => res({ kind: "cancelled" }),
            run: async () => res(await runJob(...args)),
          };
        });
      }

      return runJob(...args);
    },
  };
}
