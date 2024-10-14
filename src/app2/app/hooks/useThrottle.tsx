import { useEffect, useReducer, useRef } from "react";
import { useIsMounted } from "./useIsMounted";
import { throttle } from "@/lib/throttle";

export function useThrottle<T>(value: T, interval: number) {
  // Easier to use refs when value could be a function
  const throttledValue = useRef(value);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  const mounted = useIsMounted();
  const cb = (x: T) => {
    if (mounted()) {
      throttledValue.current = x;
      forceUpdate();
    }
  };

  const setter = useRef(throttle(cb, interval));
  useEffect(() => {
    setter.current(value);
  }, [value]);

  return throttledValue.current;
}
