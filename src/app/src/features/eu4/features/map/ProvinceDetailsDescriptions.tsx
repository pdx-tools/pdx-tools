import React from "react";
import {
  CountryState,
  ProvinceCountryImprovement,
  ProvinceDetails,
  ProvinceHistoryEvent,
  TradeCompanyInvestments,
} from "../../types/models";
import {
  TcInvestmentAvatar,
  BuildingAvatar,
  Flag,
} from "@/features/eu4/components/avatars";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { formatFloat, formatInt } from "@/lib/format";
import { Tooltip } from "@/components/Tooltip";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";

interface ProvinceDetailsProps {
  province: ProvinceDetails;
}

const devColumnHelper = createColumnHelper<ProvinceCountryImprovement>();
const devColumns = [
  devColumnHelper.accessor("country", {
    header: "Country",
    cell: (info) => <Flag {...info.getValue()} />,
  }),

  devColumnHelper.accessor("improvements", {
    header: "Dev Count",
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

const stateColumnHelper = createColumnHelper<CountryState>();
const stateColumns = [
  stateColumnHelper.accessor("country", {
    header: "Country",
    cell: (info) => <Flag {...info.getValue()} />,
  }),

  stateColumnHelper.accessor("prosperity", {
    header: "Prosperity",
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

const investmentColumnHelper = createColumnHelper<TradeCompanyInvestments>();
const investmentColumns = [
  investmentColumnHelper.accessor("country", {
    header: "Country",
    cell: (info) => <Flag {...info.getValue()} />,
  }),

  investmentColumnHelper.accessor("investments", {
    header: "Investments",
    cell: (info) => (
      <ul className="flex">
        {info.getValue().map((investment) => (
          <li key={investment.id}>
            <TcInvestmentAvatar {...investment} />
          </li>
        ))}
      </ul>
    ),
  }),
];

const historyColumnHelper = createColumnHelper<ProvinceHistoryEvent>();
const historyColumns = [
  historyColumnHelper.accessor("date", {
    header: "Date",
    meta: { className: "no-break" },
  }),

  historyColumnHelper.accessor("data", {
    header: "Event",
    cell: (info) => info.getValue().kind,
  }),

  historyColumnHelper.display({
    id: "graphics",
    cell: (info) => {
      const event = info.row.original.data;
      if (event.kind == "Owner") {
        return <Flag tag={event.tag} name={event.name} />;
      } else if (event.kind == "Demolished" || event.kind == "Constructed") {
        return <BuildingAvatar {...event} />;
      }
    },
  }),
];

export const ProvinceDetailsDescriptions = ({
  province,
}: ProvinceDetailsProps) => {
  const sideBarContainerRef = useSideBarContainerRef();
  return (
    <div className="flex max-h-full flex-col gap-12" ref={sideBarContainerRef}>
      <table>
        <tbody>
          <tr>
            <th className="py-2 text-left">Development:</th>
            <td className="py-2">
              <Tooltip>
                <Tooltip.Trigger>
                  {province.base_tax} / {province.base_production} /{" "}
                  {province.base_manpower}
                </Tooltip.Trigger>
                <Tooltip.Content>tax / production / manpower</Tooltip.Content>
              </Tooltip>
            </td>
          </tr>
          <tr>
            <th className="py-2 text-left">Owner:</th>
            <td className="py-2">
              {province.owner ? (
                <Flag tag={province.owner.tag} name={province.owner.name} />
              ) : (
                "---"
              )}
            </td>
          </tr>
          <tr>
            <th className="py-2 text-left">Controller:</th>
            <td className="py-2">
              {province.controller ? (
                <Flag
                  tag={province.controller.tag}
                  name={province.controller.name}
                />
              ) : (
                "---"
              )}
            </td>
          </tr>
          <tr>
            <th className="py-2 text-left">Cores:</th>
            <td className="py-2">
              <ul className="flex flex-wrap gap-2">
                {province.cores.map((core) => (
                  <li key={core.tag}>
                    <Flag tag={core.tag} name={core.name} condensed={true} />
                  </li>
                ))}
              </ul>
            </td>
          </tr>
          <tr>
            <th className="py-2 text-left">Claims:</th>
            <td className="py-2">
              <ul className="flex flex-wrap gap-2">
                {province.claims.map((claim) => (
                  <li key={claim.tag}>
                    <Flag tag={claim.tag} name={claim.name} condensed={true} />
                  </li>
                ))}
              </ul>
            </td>
          </tr>
          <tr>
            <th className="py-2 text-left">Religion:</th>
            <td className="py-2">{province.religion || "---"}</td>
          </tr>
          <tr>
            <th className="py-2 text-left">Culture:</th>
            <td className="py-2">{province.culture || "---"}</td>
          </tr>
          <tr>
            <th className="py-2 text-left">Devastation:</th>
            <td className="py-2">{formatFloat(province.devastation)}</td>
          </tr>
          <tr>
            <th className="py-2 text-left">Trade Goods:</th>
            <td className="py-2">{province.trade_goods || "---"}</td>
          </tr>
          <tr>
            <th className="py-2 text-left">Latent Trade Goods:</th>
            <td className="py-2">{province.latent_trade_goods.join(", ")}</td>
          </tr>
          <tr>
            <th className="py-2 text-left">In Trade Company:</th>
            <td className="py-2">
              {province.is_in_trade_company ? "yes" : "no"}
            </td>
          </tr>
          <tr>
            <th className="py-2 text-left">Buildings:</th>
            <td className="py-2">
              <ul className="flex flex-wrap gap-2">
                {province.buildings.map((building) => (
                  <li key={building.id}>
                    <BuildingAvatar condensed={true} {...building} />
                  </li>
                ))}
              </ul>
            </td>
          </tr>
        </tbody>
      </table>

      <div>
        <div>Developments</div>
        <DataTable columns={devColumns} data={province.improvements} />
      </div>

      {!province.map_area ? null : (
        <div>
          <div>{province.map_area?.area_name} States</div>
          <DataTable columns={stateColumns} data={province.map_area.states} />
          {province.map_area.investments.length == 0 ? null : (
            <>
              <div>
                {province.map_area?.area_name} Trade Company Investments
              </div>
              <DataTable
                columns={investmentColumns}
                data={province.map_area.investments}
              />
            </>
          )}
        </div>
      )}

      <div>
        <div>Province History</div>
        <DataTable columns={historyColumns} data={province.history} />
      </div>
    </div>
  );
};
