import { useId, useMemo } from "react";
import { cx } from "class-variance-authority";
import { Link } from "@/components/Link";
import { formatInt } from "@/lib/format";
import type { UserSaves } from "@/server-lib/db";
import { SaveCard } from "./SaveCard";
import { Eu5SaveCard } from "./Eu5SaveCard";
import { useSavesGroupedByPlaythrough } from "./UserSaveTable";
import { eu4Campaigns, formatGameDate, groupEu5Campaigns, mergeCampaigns } from "./campaigns";
import type { Campaign } from "./campaigns";

export function useCampaigns(user: UserSaves): Campaign[] {
  const eu4Groups = useSavesGroupedByPlaythrough(user.saves);
  return useMemo(
    () => mergeCampaigns(eu4Campaigns(eu4Groups), groupEu5Campaigns(user.eu5_saves)),
    [eu4Groups, user.eu5_saves],
  );
}

/** The game a campaign belongs to, as a small mark beside its name. */
export function GameMark({ game, className }: { game: Campaign["game"]; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 shrink-0 items-center rounded border border-gray-400/70 bg-gray-100 px-1.5 font-mono text-[11px] font-semibold tracking-wide text-gray-700 uppercase dark:border-gray-600 dark:bg-slate-700 dark:text-gray-200",
        className,
      )}
    >
      {game === "eu5" ? "EU5" : "EU4"}
    </span>
  );
}

function latestGameDate(campaign: Campaign): string {
  // Saves are sorted latest game date first within a campaign.
  return formatGameDate(campaign.saves[0].date);
}

export function CampaignList({
  campaigns,
  canDeleteSaves,
}: {
  campaigns: readonly Campaign[];
  canDeleteSaves: boolean;
}) {
  return (
    <div className="flex flex-col gap-12">
      {campaigns.map((campaign) => (
        <CampaignSection key={campaign.key} campaign={campaign} canDeleteSaves={canDeleteSaves} />
      ))}
    </div>
  );
}

function CampaignSection({
  campaign,
  canDeleteSaves,
}: {
  campaign: Campaign;
  canDeleteSaves: boolean;
}) {
  // Campaign keys are not safe to use as an html id, so the heading gets a
  // generated id instead.
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gray-400/50 pb-2">
        <GameMark game={campaign.game} className="self-center" />
        <h2
          id={headingId}
          className="min-w-0 truncate text-xl leading-tight font-semibold lg:text-2xl"
        >
          {campaign.name}
        </h2>
        {campaign.derivedName && (
          <span className="text-sm text-gray-600 dark:text-gray-400">unnamed campaign</span>
        )}
        <span className="ml-auto text-sm text-gray-600 tabular-nums dark:text-gray-400">
          {formatInt(campaign.saves.length)} {campaign.saves.length === 1 ? "save" : "saves"}
          <span className="mx-1.5 text-gray-400">·</span>
          latest {latestGameDate(campaign)}
        </span>
      </header>

      {campaign.game === "eu5"
        ? campaign.saves.map((save) => (
            <Eu5SaveCard key={save.id} save={save} canDelete={canDeleteSaves} />
          ))
        : campaign.saves.map((save) => (
            <SaveCard key={save.id} save={save} canDelete={canDeleteSaves} />
          ))}
    </section>
  );
}

/**
 * Nothing shared yet. The owner is told how sharing starts; a visitor is
 * told there is nothing to see, and where the player's saves would appear.
 */
export function NoCampaigns({ isOwner, userName }: { isOwner: boolean; userName: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-400/70 px-6 py-10 text-center">
      {isOwner ? (
        <>
          <p className="text-lg font-semibold">You have not shared a save yet.</p>
          <p className="mx-auto mt-2 max-w-prose text-gray-600 dark:text-gray-400">
            <Link to="/">Drop an EU4 or EU5 save</Link> on the home page, then press the share
            button at the bottom of the sidebar. Every save you share gets a public permalink and
            shows up here, grouped by campaign.
          </p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold">{userName} has not shared a save yet.</p>
          <p className="mx-auto mt-2 max-w-prose text-gray-600 dark:text-gray-400">
            Shared campaigns and their saves will appear here.
          </p>
        </>
      )}
    </div>
  );
}
