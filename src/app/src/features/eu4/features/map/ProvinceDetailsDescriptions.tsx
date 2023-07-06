import React from "react";
import { Table, Tooltip } from "antd";
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
      onFilter: (value, record) => record.data.kind == value,
    },
    {
      dataIndex: [],
      render: (_undef: undefined, event: ProvinceEventIndex) => {
        if (event.data.kind == "Owner") {
          return <FlagAvatar tag={event.data.tag} name={event.data.name} />;
        } else if (
          event.data.kind == "Demolished" ||
          event.data.kind == "Constructed"
        ) {
          return <BuildingAvatar {...event.data} />;
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
      <table>
        <tbody>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Id:</th>
            <td className="py-2">{province.id}</td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Name:</th>
            <td className="py-2">{province.name}</td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Development:</th>
            <td className="py-2">
              <Tooltip title="tax / production / manpower">
                {`${province.base_tax} / ${province.base_production} / ${province.base_manpower}`}
              </Tooltip>
            </td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Owner:</th>
            <td className="py-2">
              {province.owner ? (
                <FlagAvatar
                  tag={province.owner.tag}
                  name={province.owner.name}
                />
              ) : (
                "---"
              )}
            </td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Controller:</th>
            <td className="py-2">
              {province.controller ? (
                <FlagAvatar
                  tag={province.controller.tag}
                  name={province.controller.name}
                />
              ) : (
                "---"
              )}
            </td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Cores:</th>
            <td className="py-2">
              {province.cores.map((core) => (
                <FlagAvatar
                  key={core.tag}
                  tag={core.tag}
                  name={core.name}
                  condensed={true}
                />
              ))}
            </td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Claims:</th>
            <td className="py-2">
              {province.claims.map((claim) => (
                <FlagAvatar
                  key={claim.tag}
                  tag={claim.tag}
                  name={claim.name}
                  condensed={true}
                />
              ))}
            </td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Religion:</th>
            <td className="py-2">{province.religion || "---"}</td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Culture:</th>
            <td className="py-2">{province.culture || "---"}</td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Devastation:</th>
            <td className="py-2">{formatFloat(province.devastation)}</td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Trade Goods:</th>
            <td className="py-2">{province.trade_goods || "---"}</td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Latent Trade Goods:</th>
            <td className="py-2">{province.latent_trade_goods.join(", ")}</td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">In Trade Company:</th>
            <td className="py-2">
              {province.is_in_trade_company ? "yes" : "no"}
            </td>
          </tr>
          <tr className="odd:bg-white even:bg-slate-50">
            <th className="py-2 text-left">Buildings:</th>
            <td className="py-2">
              <div className="flex flex-wrap gap-2">
                {province.buildings.map((building) => (
                  <BuildingAvatar
                    condensed={true}
                    key={building.id}
                    {...building}
                  />
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

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
