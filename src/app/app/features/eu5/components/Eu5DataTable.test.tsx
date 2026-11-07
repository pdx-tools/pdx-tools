import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tooltip } from "@/components/Tooltip";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable, exactCellValue } from "./Eu5DataTable";

type Row = { name: string };

const columnHelper = createColumnHelper<Row>();
const columns = [columnHelper.accessor("name", { cell: (info) => info.getValue() })];
const data: Row[] = Array.from({ length: 25 }, (_, i) => ({ name: `row-${i}` }));

const renderedRows = (markup: string) => markup.match(/row-\d+/g)?.length ?? 0;

it("shows every row when the table has no pages", () => {
  const markup = renderToStaticMarkup(<Eu5DataTable columns={columns} data={data} />);
  expect(renderedRows(markup)).toBe(25);
});

it("shows one page of rows when the table has pages", () => {
  const markup = renderToStaticMarkup(
    <Eu5DataTable columns={columns} data={data} pagination={{ pageSize: 10 }} />,
  );
  expect(renderedRows(markup)).toBe(10);
});

it("has one tab stop for the cells with a full value", () => {
  type Amount = { amount: number };
  const helper = createColumnHelper<Amount>();
  const markup = renderToStaticMarkup(
    <Eu5DataTable
      columns={[
        helper.accessor("amount", {
          enableSorting: false,
          meta: Eu5DataTable.meta({ variant: "num" }),
          cell: (info) => info.getValue(),
        }),
      ]}
      data={[{ amount: 293 }, { amount: 12073.9 }, { amount: 54321 }]}
    />,
  );
  expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
  expect(markup.match(/tabindex="-1"/g)).toHaveLength(1);
  expect(markup).toContain('data-exact="12,073.9"');
  expect(markup).not.toContain('data-exact="293"');
});

it("marks a header that names a defined term", () => {
  type Gap = { gap: number; other: number };
  const helper = createColumnHelper<Gap>();
  const markup = renderToStaticMarkup(
    <Tooltip.Provider>
      <Eu5DataTable
        columns={[
          helper.accessor("gap", {
            meta: Eu5DataTable.meta({ headerLabel: "Tax Gap", variant: "num" }),
          }),
          helper.accessor("other", {
            meta: Eu5DataTable.meta({ headerLabel: "Other", variant: "num" }),
          }),
        ]}
        data={[]}
      />
    </Tooltip.Provider>,
  );
  expect(markup.match(/cursor-help/g)).toHaveLength(1);
  expect(markup).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*tabindex/);
});

describe("exactCellValue", () => {
  it("gives a numeric column its full value", () => {
    expect(exactCellValue(12073.9, { variant: "num" })).toBe("12,073.9");
    expect(exactCellValue(1234, { variant: "num" })).toBe("1,234");
    expect(exactCellValue(0.001, { variant: "num" })).toBe("<0.01");
  });

  it("gives nothing for a figure that shows in full", () => {
    expect(exactCellValue(293, { variant: "num" })).toBeUndefined();
    expect(exactCellValue(65.8, { variant: "num" })).toBeUndefined();
    expect(exactCellValue(0, { variant: "num" })).toBeUndefined();
  });

  it("gives nothing for a column that is not numeric or a value that is not a number", () => {
    expect(exactCellValue(12073.9, {})).toBeUndefined();
    expect(exactCellValue("Paris", { variant: "num" })).toBeUndefined();
    expect(exactCellValue(Number.NaN, { variant: "num" })).toBeUndefined();
  });

  it("uses the form of the column when it has one", () => {
    const exact = (value: number) => `${value * 100}%`;
    expect(exactCellValue(0.5, { variant: "num", exact })).toBe("50%");
  });
});
