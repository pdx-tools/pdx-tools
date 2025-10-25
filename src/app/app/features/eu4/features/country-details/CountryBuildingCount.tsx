import React from "react";
import type { CountryDetails } from "../../types/models";
import { Bar } from "@/components/viz";
import type { BarConfig } from "@/components/viz";

interface CountryBuildingCountProps {
  details: CountryDetails;
}

const CountryBuildingCountImpl = ({ details }: CountryBuildingCountProps) => {
  const data = Array.from(details.building_count.entries(), ([key, val]) => ({
    label: key,
    value: val,
  }));

  data.sort((a, b) => a.label.localeCompare(b.label));

  const buildingConfig: BarConfig = {
    data,
    xField: "value",
    yField: "label",
    label: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (_text: any, item: any) => item._origin.value.toFixed(0),
      style: {
        fill: "#fff",
      },
    },
    xAxis: false,
    meta: {
      value: {
        alias: "provinces",
        min: 0,
        max: details.num_cities,
      },
    },
  };

  return <Bar style={{ height: 20 + 30 * data.length }} {...buildingConfig} />;
};

export const CountryBuildingCount = React.memo(CountryBuildingCountImpl);
