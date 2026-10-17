import { useEffect } from "react";
import { emitEvent } from "@/lib/events";
import { useLocation } from "react-router";

export function PostHog() {
  const location = useLocation();

  useEffect(() => {
    emitEvent({ kind: "$pageview" });
  }, [location]);

  return null;
}
