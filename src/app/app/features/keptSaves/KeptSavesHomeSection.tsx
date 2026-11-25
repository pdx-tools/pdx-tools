import { Button } from "@/components/Button";
import { Link } from "@/components/Link";
import { GameMark } from "@/features/saves/saveDetails";
import { groupKept } from "./groupKept";
import { KeptFlag } from "./KeptFlag";
import { useKept } from "./keptStore";
import { formatPageDate, savesText } from "./text";
import { GAMES } from "./types";
import { useOpenKept } from "./useOpenKept";
import { act } from "./watchService";
import { WatchRow } from "./WatchRow";

export default function KeptSavesHomeSection() {
  const { saves, index, watches } = useKept();
  const open = useOpenKept();
  const games = GAMES.filter((game) => game in watches);
  if (saves === null) return null;
  const latest = groupKept(saves, index).flatMap((group) =>
    group.isKnown ? [group.saves[0]] : [],
  );
  return (
    <section
      aria-labelledby="kept-saves-home"
      className="bg-white px-5 pt-4 pb-8 text-base md:px-9 dark:bg-transparent"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="kept-saves-home" className="text-2xl font-bold">
            Kept saves
          </h2>
          <Link to="/saves/kept">
            {saves.length > 1 ? `All ${savesText(saves.length, "kept")}` : "Kept saves page"}
          </Link>
        </div>
        {games.length > 0 && (
          <div className="rounded-lg border border-gray-300 dark:border-gray-600">
            {games.map((game) => (
              <WatchRow key={game} game={game} isPrimary={game === games[0]} />
            ))}
          </div>
        )}
        <ul className="divide-y divide-gray-300 dark:divide-gray-600">
          {latest.slice(0, 3).map((save) => (
            <li key={save.hash} className="flex flex-wrap items-center gap-3 py-2.5">
              <KeptFlag save={save} />
              <p className="min-w-0 grow break-words">
                <strong>{save.countryName}</strong> {formatPageDate(save.date)}
              </p>
              <GameMark game={save.game} />
              <Button className="py-1.5 text-sm" onClick={() => act(open(save))}>
                Open save
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
