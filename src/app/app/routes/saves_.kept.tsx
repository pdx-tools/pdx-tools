import { useLoaderData } from "react-router";
import { WebPage } from "@/components/layout/WebPage";
import { KeptSavesPage } from "@/features/keptSaves/KeptSavesPage";
import { seo } from "@/lib/seo";
import { FeedGame } from "@/server-lib/fn/feed";
import { withCore } from "@/server-lib/middleware";
import type { Route } from "./+types/saves_.kept";

export const meta = () =>
  seo({
    title: "Kept saves - PDX Tools",
    description: "Copies of your EU4 and EU5 saves in this browser",
  });

export const loader = withCore(async ({ request }: Route.LoaderArgs) => {
  const parsed = FeedGame.safeParse(new URL(request.url).searchParams.get("game"));
  return { game: parsed.success ? parsed.data : undefined };
});

/** The server has no kept saves, so it renders only the frame. */
export default function KeptSavesRoute() {
  const { game } = useLoaderData<typeof loader>();
  return (
    <WebPage>
      <KeptSavesPage game={game} />
    </WebPage>
  );
}
