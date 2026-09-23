import { useState } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Link } from "@/components/Link";
import { TimeAgo } from "@/components/TimeAgo";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { GameMark } from "@/features/account/CampaignList";
import { Eu5SaveCard } from "@/features/account/Eu5SaveCard";
import { SaveCard } from "@/features/account/SaveCard";
import { formatGameDate } from "@/features/account/campaigns";
import { formatInt } from "@/lib/format";
import { pdxApi } from "@/services/appApi";
import type { FeedCampaign, FeedContributor, FeedSave } from "@/server-lib/fn/feed";

function Contributors({ contributors }: { contributors: readonly FeedContributor[] }) {
  const names = contributors.map((x, i) => (
    <span key={x.user_id}>
      {i > 0 && (i === contributors.length - 1 ? " and " : ", ")}
      <Link to={`/users/${x.user_id}`}>{x.user_name}</Link>
    </span>
  ));
  return <span>by {names}</span>;
}

function FeaturedSave({ save }: { save: FeedSave }) {
  if (save.game === "eu5") {
    return <Eu5SaveCard save={save} canDelete={false} />;
  }

  // The entry header names the campaign and its uploaders, so the card
  // repeats neither the file name nor the user.
  return (
    <SaveCard
      save={{ ...save, name: save.filename, user_id: undefined, user_name: undefined }}
      canDelete={false}
    />
  );
}

function EarlierSave({ save }: { save: FeedSave }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 text-sm">
      <span className="tabular-nums">{formatGameDate(save.date)}</span>
      <span className="text-gray-600 dark:text-gray-400">
        <Link to={`/users/${save.user_id}`}>{save.user_name}</Link>
        <span className="mx-1.5 text-gray-400">·</span>
        <TimeAgo date={save.upload_time} />
      </span>
      <Link to={`/${save.game}/saves/${save.id}`} className="ml-auto">
        Open
      </Link>
    </li>
  );
}

/** The campaign's other saves, fetched the first time the fold opens. */
function EarlierSaves({ campaign, open }: { campaign: FeedCampaign; open: boolean }) {
  const { data, error } = pdxApi.saves.useCampaign(campaign.game, campaign.key, open);
  if (!open) {
    return null;
  }

  if (error) {
    return (
      <p className="mt-1 pl-5 text-sm text-rose-700 dark:text-rose-400">Failed to load saves</p>
    );
  }

  if (data === undefined) {
    return (
      <div className="mt-1 flex justify-center py-2">
        <LoadingIcon className="h-5 w-5" />
      </div>
    );
  }

  const earlier = data.saves.filter((x) => x.id !== campaign.furthest.id);
  return (
    <ul className="mt-1 divide-y divide-gray-400/30 border-t border-gray-400/30 pl-5">
      {earlier.map((save) => (
        <EarlierSave key={save.id} save={save} />
      ))}
    </ul>
  );
}

/**
 * One campaign in the feed: a header that names it, how far it has run, and
 * who shared it; the save that reached the furthest date as a card; and the other saves folded
 * beneath.
 */
export function FeedEntryCard({ campaign }: { campaign: FeedCampaign }) {
  const [open, setOpen] = useState(false);
  const earlierCount = campaign.save_count - 1;
  const name =
    campaign.furthest.game === "eu5"
      ? campaign.furthest.playthrough_name
      : (campaign.furthest.player_tag_name ?? campaign.furthest.player_tag);
  return (
    <article aria-label={name} className="flex flex-col">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <GameMark game={campaign.game} className="self-center" />
        <h2 className="min-w-0 truncate text-lg leading-tight font-semibold">{name}</h2>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {campaign.save_count > 1 && (
            <>
              <span className="tabular-nums">
                {formatGameDate(campaign.first_date)} – {formatGameDate(campaign.latest_date)}
              </span>
              <span className="mx-1.5 text-gray-400">·</span>
              {formatInt(campaign.save_count)} saves
              <span className="mx-1.5 text-gray-400">·</span>
            </>
          )}
          <Contributors contributors={campaign.contributors} />
        </span>
      </header>
      <FeaturedSave save={campaign.furthest} />
      {earlierCount > 0 && (
        <details className="group mt-2" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded text-sm text-gray-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-gray-400 [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            {formatInt(earlierCount)} earlier {earlierCount === 1 ? "save" : "saves"}
          </summary>
          <EarlierSaves campaign={campaign} open={open} />
        </details>
      )}
    </article>
  );
}
