import React, { useRef, useState } from "react";
import { EyeOutlined } from "@ant-design/icons";
import { Button, Card, Descriptions, Divider, Grid, List, Tooltip } from "antd";
import Link from "next/link";
import { useSelector } from "react-redux";
import { TimeAgo } from "@/components/TimeAgo";
import { difficultyText } from "@/lib/difficulty";
import { useAppSelector } from "@/lib/store";
import { DlcList } from "@/features/eu4/components/dlc-list";
import { TagTransition } from "@/features/eu4/types/models";
import {
  AchievementAvatar,
  FlagAvatar,
  FlagAvatarCore,
} from "@/features/eu4/components/avatars";
import { selectSession } from "@/features/account/sessionSlice";
import {
  getEu4Canvas,
  getWasmWorker,
  useComputeOnSave,
  useEu4CanvasRef,
  useWasmWorker,
  WorkerClient,
} from "@/features/engine";
import { Aar } from "./Aar";
import {
  initialEu4CountryFilter,
  selectEu4MapColorPayload,
  useEu4Achievements,
  useEu4Meta,
  useEu4ModList,
} from "@/features/eu4/eu4Slice";
import { FlipBook, StringFlipBook } from "../../components/flip-book";
import { ModList } from "./ModList";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { MapPayload } from "../../types/map";

const { useBreakpoint } = Grid;

const TagDescription = (play: TagTransition) => {
  return (
    <div className="flex-col items-center">
      <FlagAvatarCore tag={play.tag} size="large" />
      <div>{play.name}</div>
      <div>{play.date}</div>
    </div>
  );
};

const playerHistories = (worker: WorkerClient) =>
  worker.eu4GetPlayerHistories();
export const InfoDrawer = () => {
  const workerRef = useWasmWorker();
  const eu4CanvasRef = useEu4CanvasRef();
  const mods = useEu4ModList();
  const { lg } = useBreakpoint();
  const session = useSelector(selectSession);
  const meta = useEu4Meta();
  const achievements = useEu4Achievements();
  const serverFile = useAppSelector((state) => state.eu4.serverSaveFile);
  const { data } = useComputeOnSave(playerHistories);
  const sideBarContainerRef = useSideBarContainerRef();
  const mapPayload = useSelector(selectEu4MapColorPayload);
  const initialMapPayload = useRef(mapPayload);
  const [filteredTag, setFilteredTag] = useState<string | undefined>(undefined);

  const visibleTag = async (tag: string) => {
    const payload =
      tag == filteredTag
        ? initialMapPayload.current
        : ({
            kind: "political",
            date: null,
            tagFilter: {
              ...initialEu4CountryFilter,
              players: "none",
              ai: "none",
              include: [tag],
              includeSubjects: true,
            },
            showSecondaryColor: false,
            paintSubjectInOverlordHue: false,
          } as MapPayload);

    const worker = getWasmWorker(workerRef);
    const eu4Canvas = getEu4Canvas(eu4CanvasRef);

    const [primary, secondary] = await worker.eu4MapColors(payload);
    eu4Canvas.map?.updateProvinceColors(primary, secondary);
    eu4Canvas.redrawMapImage();
    setFilteredTag(tag == filteredTag ? undefined : tag);
  };

  const isPrivileged =
    session.kind == "user" &&
    (session.user.account == "admin" ||
      session.user.user_id == serverFile?.user_id);

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
              <a>{serverFile.user_name}</a>
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
        <Descriptions.Item label="DLC" span={lg ? 2 : 1}>
          <DlcList dlc_enabled={meta.dlc} />
        </Descriptions.Item>
      </Descriptions>
      <Divider orientation="left">Countries</Divider>
      <List
        grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}
        dataSource={data}
        renderItem={(item) => (
          <List.Item key={item.latest}>
            <Card
              title={
                <FlagAvatar tag={item.latest} name={item.name} size="large" />
              }
              extra={
                <div className="flex-row gap">
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
