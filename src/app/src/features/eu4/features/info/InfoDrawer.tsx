import React, { useState } from "react";
import { TimeAgo } from "@/components/TimeAgo";
import { difficultyText } from "@/lib/difficulty";
import { DlcList } from "@/features/eu4/components/dlc-list";
import { TagTransition } from "@/features/eu4/types/models";
import { AchievementAvatar, Flag } from "@/features/eu4/components/avatars";
import { Aar } from "./Aar";
import { FlipBook, StringFlipBook } from "../../components/flip-book";
import { ModList } from "./ModList";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { useEu4Worker, Eu4Worker } from "@/features/eu4/worker";
import { pdxApi, sessionSelect } from "@/services/appApi";
import {
  emptyEu4CountryFilter,
  initialEu4CountryFilter,
  useAchievements,
  useEu4Actions,
  useEu4Meta,
  useEu4ModList,
  useServerSaveFile,
} from "../../store";
import { cx } from "class-variance-authority";
import { Divider } from "@/components/Divider";
import { Tooltip } from "@/components/Tooltip";
import { IconButton } from "@/components/IconButton";
import { Alert } from "@/components/Alert";
import { Link } from "@/components/Link";
import { EyeIcon } from "@heroicons/react/24/outline";
import { formatInt } from "@/lib/format";
import { Card } from "@/components/Card";

const TagDescription = (play: TagTransition) => {
  return (
    <div className="flex flex-col items-start">
      <Flag tag={play.tag} name={play.name}>
        <Flag.Image size="large" />
      </Flag>
      <div>{play.name}</div>
      <div>{play.date}</div>
    </div>
  );
};

const playerHistoriesFn = (worker: Eu4Worker) => worker.eu4GetPlayerHistories();
const luckyCountriesFn = (worker: Eu4Worker) => worker.eu4GetLuckyCountries();
const greatPowersFn = (worker: Eu4Worker) => worker.eu4GetGreatPowers();

export const InfoDrawer = () => {
  const mods = useEu4ModList();
  const meta = useEu4Meta();
  const achievements = useAchievements();
  const serverFile = useServerSaveFile();
  const playerHistories = useEu4Worker(playerHistoriesFn);
  const luckyCountries = useEu4Worker(luckyCountriesFn);
  const greatPowers = useEu4Worker(greatPowersFn);
  const sideBarContainerRef = useSideBarContainerRef();
  const [filteredTag, setFilteredTag] = useState<string | undefined>(undefined);
  const { updateTagFilter } = useEu4Actions();
  const session = pdxApi.session.useCurrent();
  const isPrivileged = sessionSelect.isPrivileged(session, {
    user_id: serverFile?.user_id,
  });

  const visibleTag = async (tag: string) => {
    if (tag === filteredTag) {
      updateTagFilter(initialEu4CountryFilter);
      setFilteredTag(undefined);
    } else {
      updateTagFilter({
        ...emptyEu4CountryFilter,
        include: [tag],
      });
      setFilteredTag(tag);
    }
  };

  const version = meta.savegame_version;
  const patch = `${version.first}.${version.second}.${version.third}.${version.fourth}`;
  return (
    <div ref={sideBarContainerRef}>
      <div className="flex flex-wrap justify-center gap-8">
        <Card className="p-4 w-80">
          <table className="table w-full">
            <tbody>
              <tr>
                <td>Date:</td>
                <td>{meta.date}</td>
              </tr>
              {meta.start_date != "1444-11-11" && (
                <tr>
                  <td>Start:</td>
                  <td>{meta.start_date}</td>
                </tr>
              )}
              <tr>
                <td>Patch:</td>
                <td>{patch}</td>
              </tr>
              <tr>
                <td>Difficulty:</td>
                <td>{difficultyText(meta.gameplayOptions.difficulty)}</td>
              </tr>
              {serverFile && (
                <>
                  <tr>
                    <td>Author:</td>
                    <td>
                      <Link href={`/users/${serverFile.user_id}`}>
                        {serverFile.user_name}
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td>Uploaded:</td>
                    <td>
                      <TimeAgo date={serverFile.upload_time} />
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </Card>
        <Card className="p-4 w-80">
          <div className="space-y-2">
            <div className="text-center text-lg">DLC</div>
            <DlcList dlc_enabled={meta.dlc} />
          </div>
        </Card>
        {achievements.kind === "Compatible" &&
        achievements.achievements.length > 0 ? (
          <Card className="p-4 w-80">
            <div className="space-y-2">
              <div className="text-center text-lg">Achievements</div>
              <div className="flex flex-wrap place-content-center space-x-2">
                {achievements.achievements.map((x) => (
                  <Tooltip key={x.id}>
                    <Tooltip.Trigger className="flex">
                      <AchievementAvatar className="h-10 w-10" id={x.id} />
                    </Tooltip.Trigger>
                    <Tooltip.Content>{x.name}</Tooltip.Content>
                  </Tooltip>
                ))}
              </div>
            </div>
          </Card>
        ) : null}
        {mods.length > 0 ? (
          <Card className="p-4 min-w-[320px] max-w-xl">
            <div className="space-y-2">
              <div className="text-center text-lg">Mods {mods.length}</div>
              <ModList />
            </div>
          </Card>
        ) : null}
      </div>
      <Divider>Countries</Divider>
      <Alert.Error msg={playerHistories.error} />
      <div className="grid gap-8 md:grid-cols-2">
        {playerHistories.data?.map((item) => (
          <Card
            variant={item.annexed || !item.is_human ? "ghost" : "default"}
            key={item.latest}
            className={cx(
              "space-y-5 p-4",
              item.annexed && "bg-rose-100 dark:bg-rose-900 saturate-50",
              !item.is_human && !item.annexed && "bg-gray-100 dark:bg-slate-800 saturate-50",
            )}
          >
            <div className="flex">
              <Flag tag={item.latest} name={item.name} size="large" />
              <div className="flex grow items-center justify-end">
                {!item.annexed && (
                  <IconButton
                    shape="square"
                    icon={<EyeIcon className="h-5 w-5" />}
                    tooltip={`Show only ${item.name} on the map`}
                    onClick={() => {
                      visibleTag(item.latest);
                    }}
                  />
                )}
              </div>
            </div>
            <div className="border border-solid border-gray-200 dark:border-gray-600"></div>
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="w-20 py-1">
                    {item.annexed ? "Annexed:" : "Status:"}
                  </td>
                  <td className="py-1">
                    {item.annexed ?? (item.is_human ? "online" : "offline")}
                  </td>
                </tr>
                <tr>
                  <td className="w-20 py-1">
                    Player{item.player_names.length == 1 ? "" : "s"}:
                  </td>
                  <td className="py-1">
                    <StringFlipBook items={item.player_names} />
                  </td>
                </tr>
                <tr>
                  <td className="w-20 py-1">History:</td>
                  <td className="py-1">
                    <FlipBook
                      items={item.transitions}
                      itemRender={(play) => <TagDescription {...play} />}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
        ))}
      </div>

      <Alert.Error msg={greatPowers.error} />
      <Alert.Error msg={luckyCountries.error} />

      <div className="grid gap-8 sm:grid-cols-2">
        {greatPowers.data && greatPowers.data.length > 0 ? (
          <div>
            <Divider paddingClassNames="pt-5">Great Powers</Divider>
            <div className="pr-4">
              <table className="w-full">
                <thead>
                  <tr>
                    <th>
                      <span className="sr-only">Country</span>
                    </th>
                    <th className="font-normal text-right">
                      Great power score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {greatPowers.data.slice(0, 8).map((x, i) => (
                    <tr key={x.country.tag}>
                      <td className="flex mt-1">
                        <Flag tag={x.country.tag} name={x.country.name}>
                          <Flag.Tooltip asChild>
                            <Flag.DrawerTrigger className="gap-2 grow">
                              <Flag.Image size="large" />
                              <div>(#{i + 1})</div>
                              <Flag.CountryName />
                            </Flag.DrawerTrigger>
                          </Flag.Tooltip>
                        </Flag>
                      </td>
                      <td className="text-right">{formatInt(x.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {luckyCountries.data && luckyCountries.data.length > 0 ? (
          <div>
            <Divider>Lucky Nations</Divider>
            <ul className="flex flex-col gap-2 pl-4">
              {luckyCountries.data.map((x) => (
                <li key={x.tag} className="flex">
                  <Flag tag={x.tag} name={x.name} size="large" />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {(serverFile?.aar || isPrivileged) && (
        <>
          <Divider>AAR</Divider>
          <Aar
            defaultValue={serverFile?.aar || ""}
            editMode={isPrivileged ? "privileged" : "never"}
          />
        </>
      )}
    </div>
  );
};
