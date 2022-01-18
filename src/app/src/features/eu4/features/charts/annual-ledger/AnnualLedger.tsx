import React from "react";
import { useSelector } from "react-redux";
import { Line, LineConfig } from "@/components/viz";
import { LedgerDatum } from "@/features/eu4/types/models";
import { selectEu4CountryNameLookup } from "@/features/eu4/eu4Slice";

interface LedgerProps {
  ledger: LedgerDatum[];
}

type MemoProps = LedgerProps & {
  lookup: ReturnType<typeof selectEu4CountryNameLookup>;
};

const AnnualLedgerPropped: React.FC<MemoProps> = React.memo(
  ({ ledger, lookup }) => {
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
  }
);

export const AnnualLedger: React.FC<LedgerProps> = ({ ledger }) => {
  const lookup = useSelector(selectEu4CountryNameLookup);
  return <AnnualLedgerPropped ledger={ledger} lookup={lookup} />;
};
