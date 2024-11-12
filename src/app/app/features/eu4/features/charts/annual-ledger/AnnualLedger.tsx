import React, { useEffect } from "react";
import { Line, LineConfig, useVisualizationDispatch } from "@/components/viz";
import { LedgerDatum } from "@/features/eu4/types/models";
import { createCsv } from "@/lib/csv";
import { useCountryNameLookup } from "@/features/eu4/store";
import { useLedgerData } from "./hooks";
import { Alert } from "@/components/Alert";
import { isDarkMode } from "@/lib/dark";

interface LedgerProps {
  ledger: LedgerDatum[];
}

type MemoProps = LedgerProps & {
  lookup: ReturnType<typeof useCountryNameLookup>;
};

const AnnualLedgerPropped = React.memo(function AnnualLedgerPropped({
  ledger,
  lookup,
}: MemoProps) {
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
      itemName: {
        style: {
          fill: isDarkMode() ? "#fff" : "#000",
        },
      },
    },
  };

  return <Line {...config} />;
});

export const AnnualLedger = ({
  ledger: { data = [], error },
}: {
  ledger: ReturnType<typeof useLedgerData>;
}) => {
  const lookup = useCountryNameLookup();
  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const keys: (keyof LedgerDatum)[] = ["tag", "name", "year", "value"];
        return createCsv(data, keys);
      },
    });
  }, [data, visualizationDispatch]);

  return (
    <>
      <Alert.Error msg={error} />
      <div className="h-[calc(100%-1px)]">
        <AnnualLedgerPropped ledger={data} lookup={lookup} />
      </div>
    </>
  );
};
