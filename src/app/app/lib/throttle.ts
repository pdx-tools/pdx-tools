// throttle with leading and trailing executions
export function throttle<T extends Array<unknown>>(
  func: (...args: T) => unknown,
  timeFrame: number,
) {
  let lastTime = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return function (...args: T) {
    const now = +new Date();
    if (now - lastTime >= timeFrame) {
      func(...args);
      lastTime = now;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => func(...args), timeFrame);
  };
}
