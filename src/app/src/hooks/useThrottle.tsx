import { useEffect, useRef, useState } from "react";
import { useIsMounted } from "./useIsMounted";
import { throttle } from "@/lib/throttle";

export function useThrottle<T>(value: T, interval: number) {
  const [throttledValue, setThrottledValue] = useState(() => value);

  const mounted = useIsMounted();
  const cb = (x: T) => {
    if (mounted()) {
      setThrottledValue(() => x);
    }
  };

  const setter = useRef(throttle(cb, interval));
  useEffect(() => {
    setter.current(value);
  }, [value]);

  return throttledValue;
}
