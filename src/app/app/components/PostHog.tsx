import posthog from "posthog-js";
import { useEffect } from "react";
import {
  compatibilityReport,
  isEnvironmentSupported,
} from "@/lib/compatibility";
import { emitEvent } from "@/lib/events";
import { PostHogProvider } from "posthog-js/react";
import { useLocation } from "@remix-run/react";

export function PostHog() {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.PROD && import.meta.env.VITE_POSTHOG_KEY) {
      posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
        autocapture: false,
        disable_session_recording: true,
        ui_host: "https://eu.posthog.com",
        api_host: "/ingest",
        person_profiles: "identified_only",
        persistence: "localStorage",
        capture_pageview: false,
        capture_pageleave: true,
      });
    }
  }, []);

  useEffect(() => {
    const { webgl2, offscreen } = compatibilityReport();
    const maxTextureSize = webgl2.enabled ? webgl2.textureSize.actual : null;
    const performanceCaveat = webgl2.enabled ? webgl2.performanceCaveat : null;

    emitEvent({
      kind: "$pageview",
      maxSize: maxTextureSize,
      performanceCaveat,
      offscreenCanvas: offscreen.enabled,
      supportedEnvironment: isEnvironmentSupported(),
    });
  }, [location]);

  return <PostHogProvider client={posthog} />;
}
