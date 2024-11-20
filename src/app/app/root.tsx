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
import { getErrorMessage } from "./lib/getErrorMessage";
import { Alert } from "./components/Alert";
import { Link } from "./components/Link";

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
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      {/* h-full needed for firefox when selecting map country filter */}
      <body className="h-full">
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

  return { dehydratedState: dehydrate(queryClient) };
}

export const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return (
    <div className="h-full flex align-middle justify-center">
      <Alert variant="error" className="px-6 py-4 max-w-xl place-self-center">
        <Alert.Title>PDX Tools Crashed!</Alert.Title>
        <Alert.Description className="pt-2">
          <p>{getErrorMessage(error)}</p>
          <p>
            If you keep getting this error, please report the issue on our{" "}
            <Link variant="dark" href="https://discord.gg/rCpNWQW">
              Discord
            </Link>{" "}
            or{" "}
            <Link variant="dark" href="https://github.com/pdx-tools/pdx-tools">
              Github
            </Link>
          </p>
        </Alert.Description>
      </Alert>
    </div>
  );
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
