import { useEffect } from "react";
import { useLocation } from "react-router";
import { emitEvent } from "@/lib/events";

/** Send a page view event when the route changes. */
export function usePageViewEvents() {
  const location = useLocation();

  useEffect(() => {
    emitEvent({ kind: "$pageview" });
  }, [location]);
}
