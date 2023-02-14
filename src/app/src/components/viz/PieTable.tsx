import React from "react";
import { Table, Space, Typography } from "antd";
import { formatFloat, formatInt } from "@/lib/format";
import { LegendColor, useIsLoading, Pie, PieConfig } from "@/components/viz";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const { Text } = Typography;

interface BudgetRow {
  key: string;
  value: number;
  [index: string]: string | number;
}

interface PieTableProps {
  rows: BudgetRow[];
  title: string;
  palette: Readonly<Map<string, string>>;
  paginate?: boolean;
  wholeNumbers?: boolean;
}

interface PieTablePieProps {
  rows: BudgetRow[];
  palette: Readonly<Map<string, string>>;
}

const PieTablePieImpl = ({ rows, palette }: PieTablePieProps) => {
  const chartConfig: PieConfig = {
    data: rows,
    angleField: "value",
    colorField: "key",
    autoFit: true,
    color: (data: Record<string, any>) =>
      palette.get(data["key"] as string) || "#000",
    label: {
      type: "inner",
      offset: "-30%",
      formatter: (_text: any, item: any) => `${item._origin.value.toFixed(0)}`,
    },
    interactions: [{ type: "element-active" }],
  };

  return <Pie {...chartConfig} />;
};

const PieTablePie = React.memo(PieTablePieImpl);

export const PieTable = ({
  rows,
  title,
  palette,
  paginate,
  wholeNumbers,
}: PieTableProps) => {
  const isLoading = useIsLoading();
  const isMd = useBreakpoint("md");
  const numFormatter =
    wholeNumbers || false
      ? (x: number) => formatInt(x)
      : (x: number) => formatFloat(x);

  let pag = paginate ? undefined : false;
  const total = rows.reduce((acc, x) => acc + x.value, 0);
  return (
    <Space
      size="large"
      align="start"
      direction={isMd ? "horizontal" : "vertical"}
    >
      {isLoading ? null : (
        <Table
          size="small"
          pagination={pag}
          dataSource={rows}
          title={() => title}
          summary={(_rows: readonly BudgetRow[]) => {
            const cells = [
              //@ts-ignore
              <Table.Summary.Cell key="total-label">Total</Table.Summary.Cell>,
              //@ts-ignore
              <Table.Summary.Cell key="total-value" className="text-right">
                <Text>{numFormatter(total)}</Text>
              </Table.Summary.Cell>,
            ];

            return <Table.Summary.Row>{cells}</Table.Summary.Row>;
          }}
          columns={[
            {
              title: "Class",
              dataIndex: "key",
              render: (className: string) => {
                return (
                  <Space>
                    <LegendColor color={palette.get(className)} />
                    <Text>{`${className}`}</Text>
                  </Space>
                );
              },
              sorter: (a: BudgetRow, b: BudgetRow) =>
                a.key.localeCompare(b.key),
            },
            {
              title: "Value",
              dataIndex: "value",
              align: "right",
              defaultSortOrder: "descend",
              render: (value: number) => `${numFormatter(value)}`,
              sorter: (a: BudgetRow, b: BudgetRow) => a.value - b.value,
            },
            {
              title: "Percent",
              dataIndex: "value",
              key: "percent",
              align: "right",
              render: (value: number) =>
                `${((value / total) * 100).toFixed(2)}%`,
              sorter: (a: BudgetRow, b: BudgetRow) => a.value - b.value,
            },
          ]}
        />
      )}
      <PieTablePie rows={rows} palette={palette} />
    </Space>
  );
};
