import { useEffect, useMemo, useRef, useState } from "react";

export function useIntersectionObserver<T extends HTMLElement>({
  enabled = true,
  onIntersect,
  threshold,
  rootMargin,
}: {
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
  onIntersect?: () => void;
}) {
  const ref = useRef<T>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  const onIntersectRef = useRef(onIntersect);
  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    const elem = ref.current;
    if (!elem || !enabled) {
      return;
    }

    const observer = new IntersectionObserver(
      (ent) => {
        if (ent[0].isIntersecting) {
          onIntersectRef.current?.();
        }

        setIsIntersecting(ent[0].isIntersecting);
      },
      {
        rootMargin,
        threshold,
      },
    );

    observer.observe(elem);
    return () => {
      observer.disconnect();
    };
  }, [enabled, threshold, rootMargin]);

  return useMemo(() => ({ ref, isIntersecting }), [isIntersecting]);
}
