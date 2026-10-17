import posthog from "posthog-js";
import { useEffect } from "react";
import { emitEvent } from "@/lib/events";
import { PostHogProvider } from "posthog-js/react";
import { useLocation } from "react-router";

export function PostHog() {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.PROD && import.meta.env.VITE_POSTHOG_KEY) {
      // Test to see if PostHog is causing EU5 flicker issues
      if (localStorage.getItem("ph_disabled")) {
        return;
      }

      posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
        autocapture: false,
        disable_session_recording: true,
        capture_dead_clicks: false,
        ui_host: "https://eu.posthog.com",
        api_host: "/ph",
        person_profiles: "identified_only",
        persistence: "localStorage",
        capture_pageview: false,
        capture_pageleave: true,
      });
    }
  }, []);

  useEffect(() => {
    emitEvent({ kind: "$pageview" });
  }, [location]);

  return <PostHogProvider client={posthog} />;
}
