import React from "react";
import { TimeAgo } from "@/components/TimeAgo";
import { DeleteSave } from "../eu4/components/DeleteSave";
import { AchievementAvatar, Flag } from "@/features/eu4/components/avatars";
import { Link } from "@/components/Link";
import { Card } from "@/components/Card";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { formatInt } from "@/lib/format";
import { difficultyColor } from "@/lib/difficulty";
import type { useSavesGroupedByPlaythrough } from "./UserSaveTable";

export function SaveCard({
  save,
  isPrivileged,
}: {
  save: Omit<
    ReturnType<typeof useSavesGroupedByPlaythrough>[number][number],
    "days"
  > &
    Partial<{ user_name: string; user_id: string }>;
  isPrivileged: boolean;
}) {
  return (
    <Card className="mt-2 flex flex-col gap-2 lg:flex-row">
      <img
        className="flex-1 rounded-t-md object-cover lg:h-96 lg:rounded-l-md lg:rounded-tr-none lg:object-contain"
        alt={`preview of save ${save.id}`}
        width={1200}
        height={630}
        src={`/api/saves/${save.id}/og`}
        loading="lazy"
      />
      <div className="flex min-w-56 flex-1 flex-col gap-2 p-4 lg:gap-4">
        <div className="flex flex-wrap justify-around gap-4">
          <div>
            <div className="text-center text-gray-600 dark:text-gray-400">
              <TimeAgo date={save.upload_time} />
            </div>

            {save.user_id && save.user_name && (
              <div className="line-clamp-1 break-all text-center">
                <Link href={`/users/${save.user_id}`}>{save.user_name}</Link>
              </div>
            )}

            {save.filename !== save.name && (
              <div className="line-clamp-1 break-all text-center text-gray-600 dark:text-gray-400">
                {save.filename}
              </div>
            )}
          </div>

          {save.players <= 1 ? (
            <div className="flex justify-center gap-2 lg:my-3">
              <Flag
                tag={save.player_tag}
                name={save.player_tag_name ?? save.player_tag}
              >
                <Flag.Image size="large" />
                <div>
                  <Flag.CountryName className="line-clamp-1 break-all" />
                  <div>
                    {save.patch}{" "}
                    <span
                      className={
                        difficultyColor(save.game_difficulty) ??
                        "text-gray-600 dark:text-gray-400"
                      }
                    >
                      ({save.game_difficulty})
                    </span>
                  </div>
                </div>
              </Flag>
            </div>
          ) : (
            <div className="text-center">
              {formatInt(save.players)} players on {save.patch}
            </div>
          )}
        </div>

        {save.achievements.length > 0 && (
          <div className="mt-3 flex flex-col items-center space-y-2">
            <div className="text-lg">Achievements</div>
            <div className="flex flex-wrap justify-center gap-2">
              {save.achievements.map((x) => (
                <AchievementAvatar key={x} size={40} id={x} />
              ))}
            </div>
          </div>
        )}

        <div className="my-2 grow border-b border-gray-600" />
        <div className="flex justify-evenly gap-4">
          {isPrivileged && (
            <DeleteSave saveId={save.id} variant="ghost" shape="none" />
          )}
          <Link href={`/eu4/saves/${save.id}`} target="_blank">
            <ArrowTopRightOnSquareIcon className="h-8 w-8" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
