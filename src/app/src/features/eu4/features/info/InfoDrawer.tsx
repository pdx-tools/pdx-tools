import React, { useState } from "react";
import { EyeOutlined } from "@ant-design/icons";
import { Button, Card, Descriptions, Divider, List, Tooltip } from "antd";
import Link from "next/link";
import { TimeAgo } from "@/components/TimeAgo";
import { difficultyText } from "@/lib/difficulty";
import { DlcList } from "@/features/eu4/components/dlc-list";
import { TagTransition } from "@/features/eu4/types/models";
import {
  AchievementAvatar,
  FlagAvatar,
  FlagAvatarCore,
  TagFlag,
} from "@/features/eu4/components/avatars";
import { Aar } from "./Aar";
import { FlipBook, StringFlipBook } from "../../components/flip-book";
import { ModList } from "./ModList";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { useEu4Worker, Eu4Worker } from "@/features/eu4/worker";
import { useIsPrivileged } from "@/services/appApi";
import {
  emptyEu4CountryFilter,
  useAchievements,
  useEu4Actions,
  useEu4Meta,
  useEu4ModList,
  useServerSaveFile,
  useTagFilter,
} from "../../store";

const TagDescription = (play: TagTransition) => {
  return (
    <div className="flex flex-col items-center">
      <FlagAvatarCore tag={play.tag} size="large" />
      <div>{play.name}</div>
      <div>{play.date}</div>
    </div>
  );
};

const playerHistoriesFn = (worker: Eu4Worker) => worker.eu4GetPlayerHistories();

export const InfoDrawer = () => {
  const mods = useEu4ModList();
  const meta = useEu4Meta();
  const achievements = useAchievements();
  const serverFile = useServerSaveFile();
  const playerHistories = useEu4Worker(playerHistoriesFn);
  const sideBarContainerRef = useSideBarContainerRef();
  const [filteredTag, setFilteredTag] = useState<string | undefined>(undefined);
  const [initialTagFilter] = useState(useTagFilter());
  const { updateTagFilter: updateTagFilter } = useEu4Actions();
  const isPrivileged = useIsPrivileged(serverFile?.user_id);

  const visibleTag = async (tag: string) => {
    if (tag === filteredTag) {
      updateTagFilter(initialTagFilter);
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
  const descriptionStyle = { verticalAlign: "middle" };
  return (
    <div ref={sideBarContainerRef}>
      <Descriptions>
        {serverFile && (
          <Descriptions.Item label="Uploaded">
            <TimeAgo date={serverFile.upload_time} />
          </Descriptions.Item>
        )}

        {serverFile && (
          <Descriptions.Item label="By">
            <Link href={`/users/${serverFile.user_id}`}>
              {serverFile.user_name}
            </Link>
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Date">{meta.date}</Descriptions.Item>
        <Descriptions.Item label="Start">{meta.start_date}</Descriptions.Item>
        <Descriptions.Item label="Patch">{patch}</Descriptions.Item>
        <Descriptions.Item label="Difficulty">
          {difficultyText(meta.gameplayOptions.difficulty)}
        </Descriptions.Item>
        <Descriptions.Item label="Achievements">
          {achievements.kind == "compatible" &&
            (achievements.achievements.length == 0 ? (
              <span>[none]</span>
            ) : (
              achievements.achievements.map((x) => (
                <Tooltip key={x.id} title={x.name}>
                  <div>
                    <AchievementAvatar size="large" id={x.id} />
                  </div>
                </Tooltip>
              ))
            ))}
        </Descriptions.Item>
        <Descriptions.Item label={`Mods ${mods.length}`}>
          <ModList />
        </Descriptions.Item>
        <Descriptions.Item label="DLC">
          <DlcList dlc_enabled={meta.dlc} />
        </Descriptions.Item>
      </Descriptions>
      <Divider orientation="left">Countries</Divider>
      <List
        grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}
        dataSource={playerHistories.data}
        renderItem={(item) => (
          <List.Item key={item.latest}>
            <Card
              title={
                <TagFlag tag={item.latest} size="large">
                  {item.name}
                </TagFlag>
              }
              extra={
                <div className="flex items-center gap-2">
                  {!item.annexed && (
                    <Tooltip title={`Show only ${item.name} on the map`}>
                      <Button
                        key="visibility-change"
                        icon={<EyeOutlined />}
                        onClick={() => {
                          visibleTag(item.latest);
                        }}
                      ></Button>
                    </Tooltip>
                  )}
                </div>
              }
              style={{
                backgroundColor: !item.annexed
                  ? item.is_human
                    ? undefined
                    : "rgba(0, 0, 0, 0.05)"
                  : "#fff2f0",
              }}
            >
              <Descriptions column={1} labelStyle={{ alignSelf: "center" }}>
                <Descriptions.Item
                  style={descriptionStyle}
                  label={`${item.annexed ? "Annexed" : "Status"}`}
                >
                  {item.annexed ?? (item.is_human ? "online" : "offline")}
                </Descriptions.Item>

                <Descriptions.Item
                  style={descriptionStyle}
                  label={`Player${item.player_names.length == 1 ? "" : "s"}`}
                >
                  <StringFlipBook items={item.player_names} />
                </Descriptions.Item>
                <Descriptions.Item style={descriptionStyle} label={`History`}>
                  <FlipBook
                    items={item.transitions}
                    itemRender={(play) => <TagDescription {...play} />}
                  />
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </List.Item>
        )}
      />
      {(serverFile?.aar || isPrivileged) && (
        <>
          <Divider orientation="left">AAR</Divider>
          <Aar
            defaultValue={serverFile?.aar || ""}
            editMode={isPrivileged ? "privileged" : "never"}
          />
        </>
      )}
    </div>
  );
};
