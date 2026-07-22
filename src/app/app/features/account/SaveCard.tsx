import { TimeAgo } from "@/components/TimeAgo";
import { DeleteSave } from "../eu4/components/DeleteSave";
import { AchievementAvatar, Flag } from "@/features/eu4/components/avatars";
import { Link } from "@/components/Link";
import { Card } from "@/components/Card";
import { ArrowTopRightOnSquareIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { formatInt } from "@/lib/format";
import { difficultyColor, difficultyText } from "@/lib/difficulty";
import { ogImageSize, ogImageUrl } from "@/lib/media";
import type { useSavesGroupedByPlaythrough } from "./UserSaveTable";
import type { GameDifficulty } from "@/services/appApi";

const ogImageStyle = { aspectRatio: `${ogImageSize.width} / ${ogImageSize.height}` };

function PatchLine({ patch, difficulty }: { patch: string; difficulty: GameDifficulty }) {
  return (
    <div className="text-sm text-gray-600 dark:text-gray-400">
      {patch} <span className={difficultyColor(difficulty)}>({difficultyText(difficulty)})</span>
    </div>
  );
}

export function SaveCard({
  save,
  canDelete,
}: {
  save: Omit<ReturnType<typeof useSavesGroupedByPlaythrough>[number][number], "days"> &
    Partial<{ user_name: string; user_id: string }>;
  canDelete: boolean;
}) {
  return (
    <Card className="mt-2 overflow-hidden">
      <img
        className="w-full object-contain"
        style={ogImageStyle}
        alt={`preview of save ${save.id}`}
        width={ogImageSize.width}
        height={ogImageSize.height}
        src={ogImageUrl(save.id)}
        loading="lazy"
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gray-400/50 p-3">
        {save.players <= 1 ? (
          <Flag tag={save.player_tag} name={save.player_tag_name ?? save.player_tag}>
            <div className="flex min-w-0 items-center gap-3">
              <Flag.Image size="large" />
              <div className="min-w-0">
                <Flag.CountryName className="line-clamp-1 text-lg leading-tight font-semibold" />
                <PatchLine patch={save.patch} difficulty={save.game_difficulty} />
              </div>
            </div>
          </Flag>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gray-200 dark:bg-slate-700">
              <UserGroupIcon className="h-7 w-7 text-gray-600 dark:text-gray-300" />
            </div>
            <div className="min-w-0">
              <div className="text-lg leading-tight font-semibold">
                {formatInt(save.players)} players
              </div>
              <PatchLine patch={save.patch} difficulty={save.game_difficulty} />
            </div>
          </div>
        )}

        <div className="min-w-0 text-sm text-gray-600 dark:text-gray-400">
          {save.user_id && save.user_name && (
            <div className="line-clamp-1 break-all">
              <Link href={`/users/${save.user_id}`}>{save.user_name}</Link>
            </div>
          )}

          <TimeAgo date={save.upload_time} />

          {save.filename !== save.name && (
            <div className="line-clamp-1 break-all">{save.filename}</div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-4">
          {save.achievements.length > 0 && (
            <div
              role="group"
              aria-label="Achievements"
              className="flex flex-wrap justify-end gap-2"
            >
              {save.achievements.map((x) => (
                <AchievementAvatar key={x} size={40} id={x} />
              ))}
            </div>
          )}

          {canDelete && (
            <DeleteSave saveId={save.id} variant="ghost" shape="none" className="shrink-0" />
          )}
          <Link
            className="shrink-0"
            to={`/eu4/saves/${save.id}`}
            target="_blank"
            aria-label="Open save"
          >
            <ArrowTopRightOnSquareIcon className="h-8 w-8" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
