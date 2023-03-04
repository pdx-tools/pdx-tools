import React, { useEffect } from "react";
import { Line, LineConfig, useVisualizationDispatch } from "@/components/viz";
import { LedgerDatum } from "@/features/eu4/types/models";
import { createCsv } from "@/lib/csv";
import { useCountryNameLookup } from "@/features/eu4/store";

interface LedgerProps {
  ledger: LedgerDatum[];
}

type MemoProps = LedgerProps & {
  lookup: ReturnType<typeof useCountryNameLookup>;
};

const AnnualLedgerPropped = React.memo(({ ledger, lookup }: MemoProps) => {
  const config: LineConfig = {
    data: ledger,
    xField: "year",
    yField: "value",
    seriesField: "name",
    color: ({ name }) => lookup.get(name as string)?.color ?? "#000",
    tooltip: {
      shared: false,
    },
    slider: {
      start: 0,
      end: 1,
    },
    legend: {
      flipPage: true,
      position: "left",
      layout: "vertical",
      itemWidth: 300,
    },
  };

  return <Line style={{ height: "100%" }} {...config} />;
});

export const AnnualLedger = ({ ledger }: LedgerProps) => {
  const lookup = useCountryNameLookup();
  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const keys: (keyof LedgerDatum)[] = ["tag", "name", "year", "value"];
        return createCsv(ledger, keys);
      },
    });
  }, [ledger, visualizationDispatch]);

  return <AnnualLedgerPropped ledger={ledger} lookup={lookup} />;
};
