import { Outlet, ScrollRestoration, createRootRoute, useRouter } from "@tanstack/react-router";
import {
  Body,
  createServerFn,
  Head,
  Html,
  Meta,
  Scripts,
} from "@tanstack/start";
import tailwindCss from "@/styles/tailwind.css?url";
import appCss from "@/styles/styles.css?url";
import * as React from "react";
import { usePdxSession } from "@/server-lib/auth/session";
import { SessionProvider } from "@/features/account";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/services/appApi";
import { Tooltip } from "@/components/Tooltip";
import { Toaster } from "@/components/Toaster";
import { ErrorCatcher } from "@/features/errors";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";
import {
  compatibilityReport,
  isEnvironmentSupported,
} from "@/lib/compatibility";
import { emitEvent } from "@/lib/events";
import { PostHogProvider } from "posthog-js/react";

export const Route = createRootRoute({
  meta: () => [
    {
      charSet: "utf-8",
    },
    {
      name: "viewport",
      content: "width=device-width, initial-scale=1",
    },
    {
      title: "TanStack Start Starter",
    },
  ],
  beforeLoad: async () => {
    const session = await fetchUser();
    return {
      session,
    };
  },
  component: RootComponent,
  links: () => [
    { rel: "stylesheet", href: tailwindCss },
    { rel: "stylesheet", href: appCss },
  ],
});

const fetchUser = createServerFn("GET", usePdxSession);

function RootComponent() {
  const { session } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider profile={session}>
        <Tooltip.Provider delayDuration={300}>
          <PostHog>
            <RootDocument>
              <Outlet />
            </RootDocument>
          </PostHog>
          <Toaster />
        </Tooltip.Provider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <Html>
      <Head>
        <Meta />
      </Head>
      <Body>
        <ErrorCatcher>{children}</ErrorCatcher>
        <ScrollRestoration />
        <Scripts />
      </Body>
    </Html>
  );
}

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

    const unsub = router.subscribe("onLoad", handleRouteChange);
    return () => {
      unsub();
    };
  }, [router]);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
