import { WebPage } from "@/components/layout/WebPage";
import { LoadingState } from "@/components/LoadingState";
import { Eu4GamePage } from "@/features/eu4/Eu4GamePage";
import { seo } from "@/lib/seo";
import { usingDb } from "@/server-lib/db/connection";
import { getSaves } from "@/server-lib/fn/new";
import { withCore } from "@/server-lib/middleware";
import { pdxKeys } from "@/services/appApi";
import { defer, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Await, useLoaderData } from "@remix-run/react";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { Suspense } from "react";

export const meta: MetaFunction = () =>
  seo({
    title: "EU4 - PDX Tools",
    description: "Latest uploaded EU4 saves",
  });

export const loader = withCore(async ({ context }: LoaderFunctionArgs) => {
  const { db, close } = usingDb(context);
  const queryClient = new QueryClient();
  const prefetch = queryClient
    .fetchInfiniteQuery({
      queryKey: pdxKeys.newSaves(),
      queryFn: () => getSaves(db, { pageSize: 10 }),
      retry: false,
      initialPageParam: undefined,
    })
    .then(() => dehydrate(queryClient))
    .finally(() => close());

  return defer({
    prefetch,
  });
});

export default function Eu4Route() {
  const { prefetch } = useLoaderData<typeof loader>();

  return (
    <WebPage>
      <Suspense fallback={<LoadingState />}>
        <Await resolve={prefetch}>
          {(dehydratedState) => (
            <HydrationBoundary state={dehydratedState}>
              <Eu4GamePage />
            </HydrationBoundary>
          )}
        </Await>
      </Suspense>
    </WebPage>
  );
}
