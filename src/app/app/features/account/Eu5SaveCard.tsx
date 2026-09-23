import { Card } from "@/components/Card";
import { TimeAgo } from "@/components/TimeAgo";
import { ogImageSize, ogImageUrl } from "@/lib/media";
import { SaveActions } from "./SaveActions";
import { eu5Version, formatGameDate } from "./campaigns";
import type { Eu5CampaignSave } from "./campaigns";

const ogImageStyle = { aspectRatio: `${ogImageSize.width} / ${ogImageSize.height}` };

/**
 * One shared EU5 save. The campaign header above it already names the
 * playthrough, so the card leads with what tells this save from its
 * siblings: the map preview and the game date.
 */
export function Eu5SaveCard({ save, canDelete }: { save: Eu5CampaignSave; canDelete: boolean }) {
  const gameDate = formatGameDate(save.date);
  return (
    <Card className="mt-2 overflow-hidden">
      <img
        className="w-full bg-slate-900 object-contain"
        style={ogImageStyle}
        alt={`map preview of ${save.playthrough_name} on ${gameDate}`}
        width={ogImageSize.width}
        height={ogImageSize.height}
        src={ogImageUrl(save.id, "eu5")}
        loading="lazy"
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gray-400/50 p-3">
        <div className="min-w-0">
          <div className="text-lg leading-tight font-semibold">{gameDate}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">EU5 {eu5Version(save)}</div>
        </div>

        <div className="min-w-0 text-sm text-gray-600 dark:text-gray-400">
          <div>
            Uploaded <TimeAgo date={save.upload_time} />
          </div>
          <div className="line-clamp-1 break-all">{save.filename}</div>
        </div>

        <div className="ml-auto flex items-center">
          <SaveActions
            path={`/eu5/saves/${save.id}`}
            saveId={save.id}
            game="eu5"
            label={gameDate}
            canDelete={canDelete}
          />
        </div>
      </div>
    </Card>
  );
}
