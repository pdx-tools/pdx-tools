import { cx } from "class-variance-authority";
import { Link } from "@/components/Link";
import { TimeAgo } from "@/components/TimeAgo";
import { Tooltip } from "@/components/Tooltip";
import { AchievementAvatar, Flag } from "@/features/eu4/components/avatars";
import { formatGameDate } from "@/features/account/campaigns";
import { difficultyColor, difficultyText } from "@/lib/difficulty";
import { ogImageSize, ogImageUrl } from "@/lib/media";
import type { Medal, PodiumFinish } from "@/server-lib/fn/achievement";

const ogImageStyle = { aspectRatio: `${ogImageSize.width} / ${ogImageSize.height}` };

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

function PodiumRow({ finish }: { finish: PodiumFinish }) {
  const { save, medals } = finish;
  const path = `/eu4/saves/${save.id}`;
  const country = save.player_tag_name ?? save.player_tag;

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-gray-400/40 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
      <Link
        to={path}
        variant="ghost"
        tabIndex={-1}
        aria-hidden
        className="group/thumb block rounded-sm"
      >
        <img
          className="w-24 shrink-0 rounded-sm border border-gray-400/50 bg-slate-900 object-contain transition-colors group-hover/thumb:border-sky-600 sm:w-32 md:w-40"
          style={ogImageStyle}
          alt=""
          width={ogImageSize.width}
          height={ogImageSize.height}
          src={ogImageUrl(save.id, save.game)}
          loading="lazy"
        />
      </Link>

      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="leading-tight font-semibold">
          <Link to={path} variant="ghost" className="hover:underline">
            <Flag tag={save.player_tag} name={country}>
              <span className="flex min-w-0 items-center gap-2">
                <Flag.Image size="xs" />
                <Flag.CountryName className="truncate" />
              </span>
            </Flag>
          </Link>
        </h3>
        <div className="text-sm text-gray-600 tabular-nums dark:text-gray-400">
          {formatGameDate(save.date)} on {save.patch}
          {save.game_difficulty !== "Normal" && (
            <span className={cx("ml-1", difficultyColor(save.game_difficulty))}>
              ({difficultyText(save.game_difficulty)})
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-1.5 text-sm text-gray-600 dark:text-gray-400">
          <Link to={`/users/${save.user_id}`} className="min-w-0 truncate">
            {save.user_name}
          </Link>
          <span aria-hidden className="text-gray-400">
            ·
          </span>
          <span>
            uploaded <TimeAgo date={save.upload_time} />
          </span>
        </div>
      </div>

      <ul
        aria-label="Medals"
        className="col-span-2 flex flex-wrap gap-2.5 md:col-span-1 md:max-w-64 md:justify-end"
      >
        {medals.map((medal) => (
          <li key={medal.id} className="relative">
            <MedalLink medal={medal} />
            <MedalBadge rank={medal.rank} />
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * The newest runs to take a top-three place on an achievement leaderboard.
 * A run is one row however many medals it holds, and every medal links to
 * its leaderboard.
 */
export function PodiumFinishes({ finishes }: { finishes: PodiumFinish[] }) {
  return (
    <Tooltip.Provider delayDuration={120}>
      <ol className="flex flex-col">
        {finishes.map((finish) => (
          <PodiumRow key={finish.save.id} finish={finish} />
        ))}
      </ol>
    </Tooltip.Provider>
  );
}
