import React, { useEffect, useMemo } from "react";
import { PageHeader, Typography, Input, Spin } from "antd";
import { useSelector } from "react-redux";
import { SkanUserSavesTable } from "./SkanUserSavesTable";
import { selectUserInfo } from "../account/sessionSlice";
import { useRouter } from "next/router";
import { extractSaveId } from "./skanUrl";
import { rakalyApi } from "../../services/rakalyApi";
import { epochOf } from "@/lib/dates";
const { Paragraph } = Typography;
const { Search } = Input;

export const SkanderbegPage: React.FC<{}> = () => {
  const router = useRouter();
  const userInfo = useSelector(selectUserInfo);
  const [trigger, { isFetching, data }] =
    rakalyApi.endpoints.getSkanderbegSaves.useLazyQuery();

  useEffect(() => {
    if (userInfo) {
      trigger();
    }
  }, [userInfo, trigger]);

  const skanSaves = useMemo(() => {
    const saves = data?.map((obj) => ({
      hash: obj.hash,
      timestamp: obj.timestamp,
      timestamp_epoch: epochOf(obj.timestamp),
      name: obj.customname || obj.name,
      uploaded_by: obj.uploaded_by,
      player: obj.player,
      date: obj.date,
      version: obj.version,
    }));
    saves?.sort((a, b) => b.timestamp_epoch - a.timestamp_epoch);
    return saves ?? [];
  }, [data]);

  let saveTable = null;
  if (userInfo) {
    let extras = null;
    if (isFetching) {
      extras = <Spin size="small" />;
    }
    saveTable = <SkanUserSavesTable loading={isFetching} records={skanSaves} />;
  }

  const footer = (
    <div>
      <Paragraph>
        <a href="https://skanderbeg.pm">Skanderbeg</a> is site dedicated to
        generating beautiful maps and insightful data tables. To analyze a
        Skanderbeg save in Rakaly, upload the save to Skanderbeg and copy and
        paste either a Skanderbeg URL or the save id. Ironman saves uploaded to
        Skanderbeg will not work in Rakaly.
      </Paragraph>
      <div className="flex-col gap">
        <Search
          placeholder="Skanderbeg URL or id"
          enterButton="Analyze"
          size="large"
          onSearch={(inp: string) =>
            router.push(`/eu4/skanderbeg/${extractSaveId(inp)}`)
          }
        />
        {saveTable}
      </div>
    </div>
  );

  return (
    <PageHeader
      title="Skanderbeg"
      footer={footer}
      style={{ maxWidth: "800px", margin: "0 auto" }}
    />
  );
};
