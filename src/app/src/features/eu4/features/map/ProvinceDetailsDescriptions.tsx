import React from "react";
import { Descriptions, Table, Tooltip } from "antd";
import { ColumnType } from "antd/lib/table";
import {
  CountryState,
  LocalizedObj,
  LocalizedTag,
  ProvinceCountryImprovement,
  ProvinceDetails,
  ProvinceHistoryEvent,
  TradeCompanyInvestments,
} from "../../types/models";
import { diff } from "@/lib/dates";
import {
  TcInvestmentAvatar,
  BuildingAvatar,
  FlagAvatar,
} from "@/features/eu4/components/avatars";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { formatFloat } from "@/lib/format";

interface ProvinceDetailsProps {
  province: ProvinceDetails;
}

type ProvinceEventIndex = { index: number } & ProvinceHistoryEvent;

export const ProvinceDetailsDescriptions = ({
  province,
}: ProvinceDetailsProps) => {
  const sideBarContainerRef = useSideBarContainerRef();
  const events: ProvinceEventIndex[] = province.history.map((x, i) => ({
    index: i,
    ...x,
  }));

  const columns: ColumnType<ProvinceEventIndex>[] = [
    {
      title: "Date",
      dataIndex: "date",
      className: "no-break",
      sorter: (a: ProvinceEventIndex, b: ProvinceEventIndex) =>
        diff(a.date, b.date),
    },
    {
      title: "Event",
      dataIndex: "kind",
      filters: [
        {
          text: "Owner",
          value: "Owner",
        },
        {
          text: "Constructed",
          value: "Constructed",
        },
        {
          text: "Demolished",
          value: "Demolished",
        },
      ],
      onFilter: (value, record) => record.kind == value,
    },
    {
      dataIndex: [],
      render: (_undef: undefined, event: ProvinceEventIndex) => {
        if (event.kind == "Owner") {
          return <FlagAvatar tag={event.tag} name={event.name} />;
        } else if (event.kind == "Demolished" || event.kind == "Constructed") {
          return <BuildingAvatar {...event} />;
        }
      },
    },
  ];

  const stateColumns: ColumnType<CountryState>[] = [
    {
      title: "Country",
      dataIndex: "country",
      render: (country: LocalizedTag) => (
        <FlagAvatar tag={country.tag} name={country.name} />
      ),
    },
    {
      title: "Prosperity",
      dataIndex: "prosperity",
    },
  ];

  const investmentColumns: ColumnType<TradeCompanyInvestments>[] = [
    {
      title: "Country",
      dataIndex: "country",
      render: (country: LocalizedTag) => (
        <FlagAvatar tag={country.tag} name={country.name} />
      ),
    },
    {
      title: "Investments",
      dataIndex: "investments",
      render: (investments: LocalizedObj[]) =>
        investments.map((investment) => (
          <TcInvestmentAvatar key={investment.id} {...investment} />
        )),
    },
  ];

  const improvementColumns: ColumnType<ProvinceCountryImprovement>[] = [
    {
      title: "Country",
      dataIndex: "country",
      render: (country: LocalizedTag) => (
        <FlagAvatar tag={country.tag} name={country.name} />
      ),
    },
    {
      title: "Devved",
      dataIndex: "improvements",
    },
  ];

  return (
    <div className="flex flex-col gap-2" ref={sideBarContainerRef}>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="Id">{province.id}</Descriptions.Item>
        <Descriptions.Item label="Name">{province.name}</Descriptions.Item>
        <Descriptions.Item label="Development">
          <Tooltip title="tax / production / manpower">
            {`${province.base_tax} / ${province.base_production} / ${province.base_manpower}`}
          </Tooltip>
        </Descriptions.Item>
        <Descriptions.Item label="Owner">
          {province.owner ? (
            <FlagAvatar tag={province.owner.tag} name={province.owner.name} />
          ) : (
            "---"
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Controller">
          {province.controller ? (
            <FlagAvatar
              tag={province.controller.tag}
              name={province.controller.name}
            />
          ) : (
            "---"
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Cores">
          {province.cores.map((core) => (
            <FlagAvatar
              key={core.tag}
              tag={core.tag}
              name={core.name}
              condensed={true}
            />
          ))}
        </Descriptions.Item>
        <Descriptions.Item label="Claims">
          {province.claims.map((claim) => (
            <FlagAvatar
              key={claim.tag}
              tag={claim.tag}
              name={claim.name}
              condensed={true}
            />
          ))}
        </Descriptions.Item>
        <Descriptions.Item label="Religion">
          {province.religion || "---"}
        </Descriptions.Item>
        <Descriptions.Item label="Culture">
          {province.culture || "---"}
        </Descriptions.Item>
        <Descriptions.Item label="Devastation">
          {formatFloat(province.devastation)}
        </Descriptions.Item>
        <Descriptions.Item label="Trade Goods">
          {province.trade_goods || "---"}
        </Descriptions.Item>
        <Descriptions.Item label="Latent Trade Goods">
          {province.latent_trade_goods.join(", ")}
        </Descriptions.Item>
        <Descriptions.Item label="In Trade Company">
          {province.is_in_trade_company ? "yes" : "no"}
        </Descriptions.Item>
        <Descriptions.Item label="Buildings">
          {province.buildings.map((building) => (
            <BuildingAvatar condensed={true} key={building.id} {...building} />
          ))}
        </Descriptions.Item>
      </Descriptions>
      <Table
        title={() => "Developments"}
        size="small"
        rowKey={(row) => row.country.tag}
        dataSource={province.improvements}
        columns={improvementColumns}
        pagination={false}
      />
      <Table
        title={() => "Province History"}
        size="small"
        rowKey="index"
        dataSource={events}
        columns={columns}
        pagination={false}
      />
      {!province.map_area ? null : (
        <>
          <Table
            key="area-state"
            title={() => `${province.map_area?.area_name} States`}
            size="small"
            rowKey={(row) => row.country.tag}
            dataSource={province.map_area.states}
            columns={stateColumns}
            pagination={false}
          />
          {province.map_area.investments.length == 0 ? null : (
            <Table
              key="area-investments"
              title={() =>
                `${province.map_area?.area_name} Trade Company Investments`
              }
              size="small"
              rowKey={(row) => row.country.tag}
              dataSource={province.map_area.investments}
              columns={investmentColumns}
              pagination={false}
            />
          )}
        </>
      )}
    </div>
  );
};
