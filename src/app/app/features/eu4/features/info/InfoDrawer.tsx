import React, { useState } from "react";
import { TimeAgo } from "@/components/TimeAgo";
import { difficultyText } from "@/lib/difficulty";
import { DlcList } from "@/features/eu4/components/dlc-list";
import { AchievementAvatar, Flag } from "@/features/eu4/components/avatars";
import { Aar } from "./Aar";
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
import {
  CompletedAchievement,
  GreatPower,
  PlayerHistory,
} from "../../../../../../wasm-eu4/pkg/wasm_eu4";
import { findMap } from "@/lib/findMap";
import { useList } from "@/hooks/useList";
import { useSession } from "@/features/account";

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
  const session = useSession();
  const isPrivileged = sessionSelect.isPrivileged(session, {
    user_id: serverFile?.user_id,
  });

  const players = playerHistories.data
    ?.map((x) => ({
      ...x,
      greatPower: findMap(greatPowers.data ?? [], (p, i) =>
        p.country.tag === x.latest ? ([p, i] as const) : undefined,
      ),
    }))
    .sort(
      (a, b) =>
        (a.greatPower?.[1] ?? Infinity) - (b.greatPower?.[1] ?? Infinity),
    );

  const version = meta.savegame_version;
  const patch = `${version.first}.${version.second}.${version.third}.${version.fourth}`;
  return (
    <div ref={sideBarContainerRef}>
      <div className="flex flex-wrap justify-center gap-8">
        <Card className="w-80 p-4">
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
              {meta.randomWorld !== undefined && (
                <tr>
                  <td>RNW seed:</td>
                  <td>{meta.randomWorld}</td>
                </tr>
              )}
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
        <Card className="w-80 p-4">
          <div className="space-y-3">
            <div className="text-center text-lg">DLC</div>
            <DlcList dlc_enabled={meta.dlc} />
          </div>
        </Card>
        {achievements.kind === "Compatible" &&
        achievements.achievements.length > 0 ? (
          <AchievementCard achievements={achievements.achievements} />
        ) : null}
        {mods.length > 0 ? (
          <Card className="min-w-[320px] max-w-xl p-4">
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
        {players?.map((item, i) => <CountryCard key={i} item={item} />)}
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
                    <th className="text-right font-normal">
                      Great power score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {greatPowers.data.slice(0, 8).map((x, i) => (
                    <tr key={x.country.tag}>
                      <td className="mt-1 flex">
                        <Flag tag={x.country.tag} name={x.country.name}>
                          <Flag.Tooltip asChild>
                            <Flag.DrawerTrigger className="grow gap-2">
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

      {(serverFile?.aar || (serverFile?.id && isPrivileged)) && (
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

function AchievementCard({
  achievements,
}: {
  achievements: CompletedAchievement[];
}) {
  const { items } = useList({
    data: achievements,
    variant: "balance",
    threshold: 4,
  });
  return (
    <Card className="w-80 p-4">
      <div className="flex flex-col items-center space-y-2">
        <div className="text-lg">Achievements</div>
        {items.map((row, i) => (
          <div key={i} className="flex gap-2">
            {row.map((x) => (
              <Tooltip key={x.id}>
                <Tooltip.Trigger className="flex">
                  <AchievementAvatar size={40} id={x.id} />
                </Tooltip.Trigger>
                <Tooltip.Content>{x.name}</Tooltip.Content>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CountryCard({
  item,
}: {
  item: PlayerHistory & {
    greatPower: readonly [GreatPower, number] | undefined;
  };
}) {
  const [filteredTag, setFilteredTag] = useState<string | undefined>(undefined);
  const { updateTagFilter } = useEu4Actions();

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

  return (
    <Card
      variant={item.annexed || !item.is_human ? "ghost" : "default"}
      key={item.latest}
      className={cx(
        "space-y-5 p-4",
        item.annexed && "bg-rose-100 saturate-50 dark:bg-rose-900",
        !item.is_human &&
          !item.annexed &&
          "bg-gray-100 saturate-50 dark:bg-slate-800",
      )}
    >
      <div className="flex">
        <Flag tag={item.latest} name={item.name}>
          <Flag.DrawerTrigger className="gap-2 pr-4">
            <Flag.Image size="large" />
            <div className="flex flex-col items-start">
              <Flag.CountryName />
              <span className="text-xs font-semibold text-gray-400/75">
                {item.player_names[0]}
              </span>
            </div>
          </Flag.DrawerTrigger>
        </Flag>
        <div className="flex grow items-center justify-end gap-2">
          {item.greatPower && (
            <Tooltip>
              <Tooltip.Trigger>(#{item.greatPower[1] + 1})</Tooltip.Trigger>
              <Tooltip.Content>
                Great power score: {formatInt(item.greatPower[0].score)}
              </Tooltip.Content>
            </Tooltip>
          )}
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

      {item.transitions.length > 1 ||
      item.annexed ||
      item.player_names.length > 1 ? (
        <div className="border border-solid border-gray-200 dark:border-gray-600"></div>
      ) : null}

      {item.player_names.length > 1 ? (
        <div className="flex flex-col">
          <p className="grow font-semibold">Players:</p>
          <div className="max-h-24 overflow-y-auto">
            {item.player_names.map((x, i) => (
              <div key={i}>{x}</div>
            ))}
          </div>
        </div>
      ) : null}

      {item.transitions.length > 1 || item.annexed ? (
        <div className="flex flex-col gap-1">
          <div className="flex">
            <p className="grow font-semibold">History:</p>
            <p className="font-semibold">Date</p>
          </div>
          <div className="max-h-24 overflow-y-auto">
            {item.transitions.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <Flag name={x.name} tag={x.tag}>
                  <Flag.Image size="xs" />
                  <Flag.CountryName className="grow" />
                </Flag>
                <span>{i !== 0 ? x.date : null}</span>
              </div>
            ))}
            {item.annexed ? (
              <div className="flex">
                <span className="grow pl-7">Annexed</span>
                <span>{item.annexed}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
