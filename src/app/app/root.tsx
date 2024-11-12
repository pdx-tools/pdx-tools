import { captureRemixErrorBoundaryError } from "@sentry/remix";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
import {
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
  json,
} from "@remix-run/cloudflare";
import tailwind from "@/styles/tailwind.css?url";
import appCss from "@/styles/styles.css?url";
import { useState } from "react";
import {
  dehydrate,
  HydrationBoundary,
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { SessionProvider } from "@/features/account";
import { Tooltip } from "@/components/Tooltip";
import { Toaster } from "@/components/Toaster";
import { PostHog } from "@/components/PostHog";
import { captureException } from "@/lib/captureException";
import { pdxKeys } from "./services/appApi";
import { pdxSession } from "./server-lib/auth/session";
import { seo } from "./lib/seo";
import appleIconUrl from "./components/head/apple-touch-icon.png";
import social from "./components/landing/social.png";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwind },
  { rel: "stylesheet", href: appCss },
  { rel: "apple-touch-icon", sizes: "180x180", href: appleIconUrl },
];

export const meta: MetaFunction = () => [
  { name: "color-scheme", content: "light dark" },
  ...seo({
    title: "PDX Tools - Modern EU4 Save Analyzer",
    description:
      "View maps, graphs, and tables of your save and compete in a casual, evergreen leaderboard of EU4 achievement speed runs. Upload and share your save with the world.",
    image: social,
  }),
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {/* FF FOUC protection https://stackoverflow.com/a/57888310/433785 */}
        <script>0</script>

        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: pdxKeys.profile(),
    queryFn: () => pdxSession({ request, context }).get(),
  });

  return json({ dehydratedState: dehydrate(queryClient) });
}

export const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};

export default function App() {
  const { dehydratedState } = useLoaderData<typeof loader>();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
          },
        },
        queryCache: new QueryCache({
          onError(error, _query) {
            captureException(error);
          },
        }),
        mutationCache: new MutationCache({
          onError(error, _variables, _context, _mutation) {
            captureException(error);
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        <SessionProvider>
          <Tooltip.Provider delayDuration={300}>
            <PostHog />
            <Toaster />
            <Outlet />
          </Tooltip.Provider>
        </SessionProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
