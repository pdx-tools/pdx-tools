import Eu4Ui from "@/features/eu4/Eu4Ui";
import { seo } from "@/lib/seo";
import { ogImageUrl, mediaPreconnectLinks } from "@/lib/media";
import { saveDescription } from "@/lib/saveDescription";
import { usingDb } from "@/server-lib/db/connection";
import { NotFoundError } from "@/server-lib/errors";
import { getSave } from "@/server-lib/fn/save";
import { log } from "@/server-lib/logging";
import { pdxKeys } from "@/services/appApi";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { data, useLoaderData, useParams } from "react-router";
import { useMemo } from "react";
import type { Route } from "./+types/eu4.saves.$saveId";

export async function loader({ params, context }: Route.LoaderArgs) {
  const { saveId } = params;
  const { db, close } = usingDb(context);
  const queryClient = new QueryClient();

  try {
    const save = await queryClient.fetchQuery({
      queryKey: pdxKeys.save(saveId),
      queryFn: () => getSave(db, { saveId }),
      retry: false,
    });
    return { dehydratedState: dehydrate(queryClient), meta: save };
  } catch (err) {
    const payload = { dehydratedState: dehydrate(queryClient), meta: null };
    if (err instanceof NotFoundError) {
      return data(payload, { status: 404 });
    }

    // DB down or other transient error → 503 (retry-later), but still render the
    // shell so the page keeps working once the client fetch recovers.
    log.exception(err, { msg: "save description loader failed", saveId });
    return data(payload, { status: 503 });
  } finally {
    close();
  }
}

export const meta = ({ params: { saveId }, loaderData }: Route.MetaArgs) =>
  seo({
    title: `EU4 Save: ${saveId}`,
    description: saveDescription(loaderData?.meta) ?? `View EU4 maps, charts, timelapses, and data`,
    image: ogImageUrl(saveId),
  });

export const links = () => mediaPreconnectLinks;

export default function SaveRoute() {
  const { dehydratedState } = useLoaderData<typeof loader>();
  const { saveId } = useParams();
  return (
    <HydrationBoundary state={dehydratedState}>
      <SavePage saveId={saveId!} />
    </HydrationBoundary>
  );
}

type SaveProps = {
  saveId: string;
};

const SavePage = ({ saveId }: SaveProps) => {
  const save = useMemo(
    () =>
      ({
        kind: "server",
        saveId,
      }) as const,
    [saveId],
  );
  return <Eu4Ui save={save} />;
};
