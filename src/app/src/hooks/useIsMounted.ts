import { useCallback, useEffect, useRef } from "react";

// https://usehooks-ts.com/react-hook/use-is-mounted
export const useIsMounted = () => {
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return useCallback(() => isMounted.current, []);
};
