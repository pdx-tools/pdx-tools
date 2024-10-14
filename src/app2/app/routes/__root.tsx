import { createRootRoute } from "@tanstack/react-router";
import { Outlet, ScrollRestoration } from "@tanstack/react-router";
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
import {
  usePdxSession,
} from "@/server-lib/auth/session";
import { SessionProvider } from "@/features/account";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/services/appApi";

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
        <RootDocument>
          <Outlet />
        </RootDocument>
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
        {children}
        <ScrollRestoration />
        <Scripts />
      </Body>
    </Html>
  );
}
