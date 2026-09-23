import { cx } from "class-variance-authority";
import { Tooltip } from "@/components/Tooltip";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { formatGameDate } from "@/features/saves/gameDate";
import { SaveTile, SaveTileItem, SaveTileList } from "@/features/saves/SaveTile";
import type { Medal, PodiumFinish } from "@/server-lib/fn/achievement";

const medalName = { 1: "Gold", 2: "Silver", 3: "Bronze" } as const;

/**
 * The colors of the podium on an achievement's own page, so a medal here
 * reads as the place it links to. The numeral carries the rank too, so the
 * color is never the only sign of it.
 */
const medalStyle = {
  1: "bg-yellow-500 text-slate-950",
  2: "bg-slate-400 text-slate-950",
  3: "bg-amber-800 text-white",
} as const;

function MedalLink({ medal }: { medal: Medal }) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <AchievementAvatar
          id={medal.id}
          name={`${medalName[medal.rank]}: ${medal.name}`}
          size={40}
          className="relative block rounded-sm ring-offset-2 ring-offset-white outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:ring-offset-slate-900"
        />
      </Tooltip.Trigger>
      <Tooltip.Content>
        <span className="font-semibold">{medalName[medal.rank]}</span> on {medal.name}
      </Tooltip.Content>
    </Tooltip>
  );
}

function MedalBadge({ rank }: { rank: Medal["rank"] }) {
  return (
    <span
      aria-hidden
      className={cx(
        "pointer-events-none absolute -right-1.5 -bottom-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full font-mono text-[11px] leading-none font-bold tabular-nums ring-2 ring-white dark:ring-slate-900",
        medalStyle[rank],
      )}
    >
      {rank}
    </span>
  );
}

/**
 * The newest runs to take a top-three place on an achievement leaderboard,
 * as tiles in the form of the campaign feed. A run is one tile however many
 * medals it holds, and every medal links to its leaderboard.
 */
export function PodiumFinishes({ finishes }: { finishes: PodiumFinish[] }) {
  return (
    <Tooltip.Provider delayDuration={120}>
      <SaveTileList>
        {finishes.map(({ save, medals }) => (
          <SaveTileItem key={save.id}>
            <SaveTile
              save={save}
              label={`${save.player_tag_name ?? save.player_tag}, ${formatGameDate(save.date)}`}
            >
              <ul aria-label="Medals" className="mt-2 flex flex-wrap gap-2.5">
                {medals.map((medal) => (
                  <li key={medal.id} className="relative">
                    <MedalLink medal={medal} />
                    <MedalBadge rank={medal.rank} />
                  </li>
                ))}
              </ul>
            </SaveTile>
          </SaveTileItem>
        ))}
      </SaveTileList>
    </Tooltip.Provider>
  );
}
