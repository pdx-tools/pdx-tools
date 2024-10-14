import { useMemo, useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useIsMounted } from "./useIsMounted";

export function useTriggeredAction<T, R extends any[]>({
  action,
}: {
  action: (...args: R) => Promise<T>;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const mounted = useIsMounted();
  const actionRef = useRef(action);
  useIsomorphicLayoutEffect(() => {
    actionRef.current = action;
  });

  return useMemo(
    () => ({
      isLoading,
      run: async (...args: R) => {
        try {
          setIsLoading(true);
          return await actionRef.current(...args);
        } finally {
          if (mounted()) {
            setIsLoading(false);
          }
        }
      },
    }),
    [isLoading, mounted],
  );
}
