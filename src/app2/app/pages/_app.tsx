import React, { useEffect, useRef } from "react";
import "@/styles/styles.css";
import "@/styles/tailwind.css";
import { AppProps } from "next/app";
import { useRouter } from "next/router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/services/appApi";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import {
  compatibilityReport,
  isEnvironmentSupported,
} from "@/lib/compatibility";
import { emitEvent } from "@/lib/events";

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
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

function PostHog({ children }: React.PropsWithChildren<{}>) {
  const router = useRouter();
  const initialLoad = useRef(true);

  useEffect(() => {
    const { webgl2, offscreen } = compatibilityReport();
    const maxTextureSize = webgl2.enabled ? webgl2.textureSize.actual : null;
    const performanceCaveat = webgl2.enabled ? webgl2.performanceCaveat : null;

    const handleRouteChange = () => {
      emitEvent({
        kind: "$pageview",
        maxSize: maxTextureSize,
        performanceCaveat,
        offscreenCanvas: offscreen.enabled,
        supportedEnvironment: isEnvironmentSupported(),
      });
    };

    // Workaround strict mode firing twice
    if (initialLoad.current) {
      handleRouteChange();
      initialLoad.current = false;
    }

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <PostHog>
      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
      </QueryClientProvider>
    </PostHog>
  );
}

export default MyApp;
