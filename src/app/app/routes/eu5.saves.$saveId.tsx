import { GameThemeProvider } from "@/components/GameThemeProvider";
import { GameButton } from "@/components/game";
import Eu5Ui from "@/features/eu5/Eu5Ui";
import { mediaPreconnectLinks, ogImageUrl } from "@/lib/media";
import { seo } from "@/lib/seo";
import { usingDb } from "@/server-lib/db/connection";
import { NotFoundError } from "@/server-lib/errors";
import { getEu5Save } from "@/server-lib/fn/eu5-save";
import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/eu5.saves.$saveId";

export async function loader({ params, context }: Route.LoaderArgs) {
  const { db, close } = usingDb(context);
  try {
    return { save: await getEu5Save(db, { saveId: params.saveId }) };
  } catch (error) {
    if (error instanceof NotFoundError) return data({ save: null }, { status: 404 });
    throw error;
  } finally {
    close();
  }
}

export const meta = ({ loaderData, params }: Route.MetaArgs) => {
  const save = loaderData?.save;
  return seo({
    title: save ? `${save.playthrough_name} - EU5 Save` : `EU5 Save: ${params.saveId}`,
    description: save
      ? `${save.playthrough_name}, an EU5 ${save.version_major}.${save.version_minor}.${save.version_patch} save from ${save.date}.`
      : "View an uploaded EU5 save.",
    image: ogImageUrl(params.saveId, "eu5"),
  });
};

export const links = () => mediaPreconnectLinks;

export default function Eu5SaveRoute() {
  const { save } = useLoaderData<typeof loader>();
  if (!save) return <Eu5SaveNotFound />;
  return <Eu5Ui save={{ kind: "server", saveId: save.id, name: save.filename }} />;
}

const Eu5SaveNotFound = () => (
  <GameThemeProvider theme="eu5">
    <div className="absolute inset-0 flex items-center justify-center bg-game-page px-6 font-game-ui">
      <div className="w-full max-w-[520px] pb-[8vh]">
        <h2 className="text-[17px] leading-tight font-medium text-game-ink-100">
          This save doesn't exist
        </h2>
        <p className="mt-3 text-[12.5px] leading-[1.5] text-game-ink-300">
          The link may be wrong, or the save was deleted.
        </p>
        <div className="mt-5">
          <GameButton variant="commit" asChild>
            <Link to="/">Load another save</Link>
          </GameButton>
        </div>
      </div>
    </div>
  </GameThemeProvider>
);
