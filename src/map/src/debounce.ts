export function debounce(func: (...args: any) => any, timeout: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: any) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = undefined;
      func(args);
    }, timeout);
  };
}
