import React, { useMemo } from "react";
import type { BarConfig } from "@ant-design/charts";
import { manaSpendAliases, manaSpendColorPalette } from "./data";
import { Bar, PieTable } from "@/components/viz";
import { CountryDetails } from "../../types/models";

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
  const overviewConfig: BarConfig = {
    data: [
      {
        key: "ADM",
        value: adm,
      },
      {
        key: "DIP",
        value: dip,
      },
      {
        key: "MIL",
        value: mil,
      },
    ],
    autoFit: true,
    xField: "value",
    yField: "key",
    seriesField: "key",
    xAxis: false,
    color: (data: Record<string, any>) =>
      manaColors.get(data["key"] as string) || "#000",
    label: {
      formatter: (_text: any, item: any) => item._origin.value.toFixed(0),
      style: {
        fill: "#fff",
      },
    },
  };

  return <Bar {...overviewConfig} />;
};

const TotalManaBar = React.memo(TotalManaBarImpl);

const ManaCategoryBarsImpl = ({ details }: CountryManaProps) => {
  const data = [
    {
      label: "Ideas",
      type: "MIL",
      value: details.mana_usage.mil.buy_idea,
    },
    {
      label: "Ideas",
      type: "DIP",
      value: details.mana_usage.dip.buy_idea,
    },
    {
      label: "Ideas",
      type: "ADM",
      value: details.mana_usage.adm.buy_idea,
    },
    {
      label: "Advance Tech",
      type: "MIL",
      value: details.mana_usage.mil.advance_tech,
    },
    {
      label: "Advance Tech",
      type: "DIP",
      value: details.mana_usage.dip.advance_tech,
    },
    {
      label: "Advance Tech",
      type: "ADM",
      value: details.mana_usage.adm.advance_tech,
    },
    {
      label: "Develop Prov",
      type: "ADM",
      value: details.mana_usage.adm.develop_prov,
    },
    {
      label: "Develop Prov",
      type: "DIP",
      value: details.mana_usage.dip.develop_prov,
    },
    {
      label: "Develop Prov",
      type: "MIL",
      value: details.mana_usage.mil.develop_prov,
    },
  ];

  const manaCompConfig: BarConfig = {
    data,
    xField: "value",
    yField: "label",
    seriesField: "type",
    isGroup: true,
    label: {
      formatter: (_text: any, item: any) => item._origin.value.toFixed(0),
      style: {
        fill: "#fff",
      },
    },
    autoFit: true,
    color: (data: Record<string, any>) =>
      manaColors.get(data["type"] as string) || "#000",
    xAxis: false,
  };

  return <Bar {...manaCompConfig} />;
};

const ManaCategoryBars = React.memo(ManaCategoryBarsImpl);
const aliases: Map<string, string> = new Map(manaSpendAliases());
const palette: Map<string, string> = new Map(manaSpendColorPalette());

export const CountryManaUsage = ({ details }: CountryManaProps) => {
  const adm_mana = useMemo(
    () =>
      Object.entries(details.mana_usage.adm)
        .filter(([_key, value]) => value !== 0.0)
        .map(([key, value]) => ({ key: aliases.get(key) || key, value })),
    [details]
  );

  const dip_mana = useMemo(
    () =>
      Object.entries(details.mana_usage.dip)
        .filter(([_key, value]) => value !== 0.0)
        .map(([key, value]) => ({ key: aliases.get(key) || key, value })),
    [details]
  );

  const mil_mana = useMemo(
    () =>
      Object.entries(details.mana_usage.mil)
        .filter(([_key, value]) => value !== 0.0)
        .map(([key, value]) => ({ key: aliases.get(key) || key, value })),
    [details]
  );

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex space-x-2">
        <TotalManaBar
          adm={adm_mana.reduce((acc, x) => acc + x.value, 0)}
          dip={dip_mana.reduce((acc, x) => acc + x.value, 0)}
          mil={mil_mana.reduce((acc, x) => acc + x.value, 0)}
        />
        <ManaCategoryBars details={details} />
      </div>
      <div className="flex flex-wrap gap-6">
        <PieTable
          palette={palette}
          title="ADM mana breakdown"
          rows={adm_mana}
          wholeNumbers={true}
        />
        <PieTable
          palette={palette}
          title="DIP mana breakdown"
          rows={dip_mana}
          wholeNumbers={true}
        />
        <PieTable
          palette={palette}
          title="MIL mana breakdown"
          rows={mil_mana}
          wholeNumbers={true}
        />
      </div>
    </div>
  );
};
