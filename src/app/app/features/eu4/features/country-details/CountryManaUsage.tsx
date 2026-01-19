import React, { useCallback, useMemo } from "react";
import { manaSpendAliases, manaSpendColorPalette } from "./data";
import { EChart, PieTable } from "@/components/viz";
import type { DataPoint, EChartsOption } from "@/components/viz";
import type { CountryDetails } from "../../types/models";
import { isDarkMode } from "@/lib/dark";
import { useEu4Worker } from "../../worker";
import type { CountryMana } from "@/wasm/wasm_eu4";
import { Alert } from "@/components/Alert";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  AdminManaIcon,
  AdmiralIcon,
  ConquistadorIcon,
  DevelopmentIcon,
  DiplomaticManaIcon,
  ExplorerIcon,
  GeneralIcon,
  MilitaryManaIcon,
  ProvincesIcon,
} from "../../components/icons";
import { HelpTooltip } from "@/components/HelpTooltip";
import { Card } from "@/components/Card";
import { Flag } from "../../components/avatars";

interface CountryManaProps {
  details: CountryDetails;
}

const manaColors = new Map([
  ["MIL", "#647698"],
  ["DIP", "#6395FA"],
  ["ADM", "#62DAAB"],
]);

interface TotalManaBarProps {
  adm: number;
  dip: number;
  mil: number;
}

const TotalManaBarImpl = ({ adm, dip, mil }: TotalManaBarProps) => {
  const isDark = isDarkMode();

  const data = useMemo(
    () => [
      {
        key: "MIL",
        value: mil,
      },
      {
        key: "DIP",
        value: dip,
      },
      {
        key: "ADM",
        value: adm,
      },
    ],
    [adm, dip, mil],
  );

  const option = useMemo((): EChartsOption => {
    return {
      grid: {
        left: 60,
        right: 40,
        top: 20,
        bottom: 40,
      },
      legend: {
        show: false,
      },
      xAxis: {
        type: "value",
        name: "Mana",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: {
          color: isDark ? "#ddd" : "#333",
          fontSize: 12,
        },
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: "dashed",
            color: isDark ? "#ddd" : "#333",
            opacity: 0.3,
            width: 1,
          },
        },
      },
      yAxis: {
        type: "category",
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        data: data.map((d) => d.key),
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        formatter: (params) => {
          if (!Array.isArray(params) || params.length === 0) {
            return "";
          }
          const param = params[0];
          return `
            <strong>${escapeEChartsHtml(param.name)}</strong><br/>
            Mana: ${formatInt(param.value as number)}
          `;
        },
      },
      series: [
        {
          type: "bar",
          data: data.map((d) => ({
            value: d.value,
            itemStyle: {
              color: manaColors.get(d.key) || "#000",
            },
          })),
          label: {
            show: true,
            position: "inside",
            formatter: (params) => formatInt(+(params.value ?? 0)),
            color: "#fff",
          },
        },
      ],
    };
  }, [data, isDark]);

  return <EChart option={option} />;
};

const TotalManaBar = React.memo(TotalManaBarImpl);

const ManaCategoryBarsImpl = ({ mana }: { mana: CountryMana }) => {
  const categories = useMemo(
    () => ["Ideas", "Advance Tech", "Develop Prov"],
    [],
  );

  const data = useMemo(
    () => ({
      ADM: [
        mana.mana_usage.adm.buy_idea,
        mana.mana_usage.adm.advance_tech,
        mana.mana_usage.adm.develop_prov,
      ],
      DIP: [
        mana.mana_usage.dip.buy_idea,
        mana.mana_usage.dip.advance_tech,
        mana.mana_usage.dip.develop_prov,
      ],
      MIL: [
        mana.mana_usage.mil.buy_idea,
        mana.mana_usage.mil.advance_tech,
        mana.mana_usage.mil.develop_prov,
      ],
    }),
    [mana],
  );

  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    return {
      grid: {
        left: 100,
        right: 40,
        top: 0,
        bottom: 40,
      },
      xAxis: {
        type: "value",
        name: "Mana",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: {
          color: isDark ? "#ddd" : "#333",
          fontSize: 12,
        },
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: "dashed",
            color: isDark ? "#ddd" : "#333",
            opacity: 0.3,
            width: 1,
          },
        },
      },
      yAxis: {
        type: "category",
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        data: categories,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
      },
      series: [
        {
          name: "ADM",
          type: "bar",
          data: data.ADM,
          itemStyle: {
            color: manaColors.get("ADM") || "#000",
          },
          label: {
            show: true,
            position: "inside",
            formatter: (params) => formatInt(+(params.value ?? 0)),
            color: "#fff",
          },
        },
        {
          name: "DIP",
          type: "bar",
          data: data.DIP,
          itemStyle: {
            color: manaColors.get("DIP") || "#000",
          },
          label: {
            show: true,
            position: "inside",
            formatter: (params) => formatInt(+(params.value ?? 0)),
            color: "#fff",
          },
        },
        {
          name: "MIL",
          type: "bar",
          data: data.MIL,
          itemStyle: {
            color: manaColors.get("MIL") || "#000",
          },
          label: {
            show: true,
            position: "inside",
            formatter: (params) => formatInt(+(params.value ?? 0)),
            color: "#fff",
          },
        },
      ],
    };
  }, [data, categories, isDark]);

  return <EChart option={option} />;
};

const ManaCategoryBars = React.memo(ManaCategoryBarsImpl);
const aliases: Map<string, string> = new Map(manaSpendAliases());
const palette: Map<string, string> = new Map(manaSpendColorPalette());

const DevClicksCard = ({ mana }: { mana: CountryMana }) => {
  const totalDevClicks = mana.development.reduce((acc, x) => acc + x.sum, 0);
  const admDevCost = mana.mana_usage.adm.develop_prov;
  const dipDevCost = mana.mana_usage.dip.develop_prov;
  const milDevCost = mana.mana_usage.mil.develop_prov;
  const totalDevCost = admDevCost + dipDevCost + milDevCost;
  const averageDevClickCost = totalDevCost / (totalDevClicks || 1);

  return (
    <Card className="flex w-max flex-col items-center gap-6 p-4">
      <div className="flex flex-col items-center gap-1">
        <div className="text-lg">Mana spent on province development:</div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1">
            <AdminManaIcon /> {formatInt(admDevCost)}
          </div>
          <div className="flex items-center gap-1">
            <DiplomaticManaIcon /> {formatInt(dipDevCost)}
          </div>
          <div className="flex items-center gap-1">
            <MilitaryManaIcon /> {formatInt(milDevCost)}
          </div>
        </div>
        <div>Total: {formatInt(totalDevCost)}</div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="text-lg">Dev clicks:</div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1">
            <ProvincesIcon /> {formatInt(mana.provinces_developed)}
          </div>
          <div className="flex items-center gap-1">
            <DevelopmentIcon /> {formatInt(totalDevClicks)}
          </div>
        </div>

        <div>
          Avg. mana cost per click: {formatFloat(averageDevClickCost, 2)}{" "}
          <HelpTooltip help="This represents a lower bound as sources of improvement are not limited to dev clicks" />
        </div>
      </div>

      {mana.development.length > 1 ? (
        <div className="flex flex-col gap-1">
          <div className="flex gap-8">
            <p className="grow font-semibold">Dev breakdown:</p>
            <p className="font-semibold">Dev clicks:</p>
          </div>
          <div>
            {mana.development.map((x) => (
              <div key={x.country.tag} className="flex items-center gap-2">
                <Flag name={x.country.name} tag={x.country.tag}>
                  <Flag.Image size="xs" />
                  <Flag.CountryName className="grow" />
                </Flag>
                <span>{formatInt(x.sum)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
};

const LeadersCard = ({ mana }: { mana: CountryMana }) => {
  const admDevCost = mana.mana_usage.adm.create_leader;
  const dipDevCost = mana.mana_usage.dip.create_leader;
  const milDevCost = mana.mana_usage.mil.create_leader;

  return (
    <Card className="flex w-max flex-col items-center gap-6 p-4">
      <div className="flex flex-col items-center gap-1">
        <div className="text-lg">Mana spent on leader recruitment:</div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1">
            <AdminManaIcon /> {formatInt(admDevCost)}
          </div>
          <div className="flex items-center gap-1">
            <DiplomaticManaIcon /> {formatInt(dipDevCost)}
          </div>
          <div className="flex items-center gap-1">
            <MilitaryManaIcon /> {formatInt(milDevCost)}
          </div>
        </div>
        <div>Total: {formatInt(admDevCost + milDevCost + dipDevCost)}</div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="text-lg">Leaders:</div>
        <div className="flex gap-8">
          <div className="flex gap-4">
            <div className="flex items-center gap-1">
              <GeneralIcon /> {formatInt(mana.generals)}
            </div>
            <div className="flex items-center gap-1">
              <ConquistadorIcon /> {formatInt(mana.conquistadors)}
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-1">
              <AdmiralIcon /> {formatInt(mana.admirals)}
            </div>
            <div className="flex items-center gap-1">
              <ExplorerIcon /> {formatInt(mana.explorers)}
            </div>
          </div>
        </div>
        <div className="flex w-full justify-evenly">
          <div>
            {formatFloat(
              milDevCost / (mana.generals + mana.conquistadors) || 0,
              2,
            )}
          </div>
          <div>Avg. mana cost</div>
          <div>
            {formatFloat(dipDevCost / (mana.admirals + mana.explorers) || 0, 2)}
          </div>
        </div>
      </div>
    </Card>
  );
};

const CountryManaUsageImpl = ({ mana }: { mana: CountryMana }) => {
  const adm_mana = useMemo(
    () =>
      Object.entries(mana.mana_usage.adm)
        .filter(([_key, value]) => value !== 0.0)
        .map(([key, value]) => ({ key: aliases.get(key) || key, value })),
    [mana.mana_usage.adm],
  );

  const dip_mana = useMemo(
    () =>
      Object.entries(mana.mana_usage.dip)
        .filter(([_key, value]) => value !== 0.0)
        .map(([key, value]) => ({ key: aliases.get(key) || key, value })),
    [mana.mana_usage.dip],
  );

  const mil_mana = useMemo(
    () =>
      Object.entries(mana.mana_usage.mil)
        .filter(([_key, value]) => value !== 0.0)
        .map(([key, value]) => ({ key: aliases.get(key) || key, value })),
    [mana.mana_usage.mil],
  );

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-wrap gap-8">
        <DevClicksCard mana={mana} />
        <LeadersCard mana={mana} />
      </div>

      <h3>Mana Expenditure</h3>
      <div className="flex space-x-2">
        <div className="min-w-0 flex-1">
          <TotalManaBar
            adm={adm_mana.reduce((acc, x) => acc + x.value, 0)}
            dip={dip_mana.reduce((acc, x) => acc + x.value, 0)}
            mil={mil_mana.reduce((acc, x) => acc + x.value, 0)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <ManaCategoryBars mana={mana} />
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <PieTable
          palette={palette}
          title="ADM mana breakdown"
          rows={adm_mana}
          wholeNumbers={true}
          negativesSlot={(rows) => <NegativeMana rows={rows} />}
        />
        <PieTable
          palette={palette}
          title="DIP mana breakdown"
          rows={dip_mana}
          wholeNumbers={true}
          negativesSlot={(rows) => <NegativeMana rows={rows} />}
        />
        <PieTable
          palette={palette}
          title="MIL mana breakdown"
          rows={mil_mana}
          wholeNumbers={true}
          negativesSlot={(rows) => <NegativeMana rows={rows} />}
        />
      </div>
    </div>
  );
};

function NegativeMana({ rows }: { rows: DataPoint[] }) {
  return (
    <div className="max-w-prose pt-2">
      Negative values excluded.{" "}
      <HelpTooltip help="Negative values are not a bug, and can represent tributes or any other game mechanic that isn't fully represented." />
      <ul>
        {rows.map((row) => (
          <li className="ml-8 list-disc" key={row.key}>
            {row.key}: {formatInt(row.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const CountryManaUsage = ({ details }: CountryManaProps) => {
  const { data, error } = useEu4Worker(
    useCallback(
      (worker) => worker.eu4GetCountrymana(details.tag),
      [details.tag],
    ),
  );

  return (
    <>
      <Alert.Error msg={error} />
      {data ? <CountryManaUsageImpl mana={data} /> : null}
    </>
  );
};
