import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tooltip } from "@/components/Tooltip";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable, exactCellValue } from "./Eu5DataTable";

type Row = { name: string };

const columnHelper = createColumnHelper<Row>();
const columns = [columnHelper.accessor("name", { cell: (info) => info.getValue() })];
const data: Row[] = Array.from({ length: 25 }, (_, i) => ({ name: `row-${i}` }));

const renderedRows = (markup: string) => markup.match(/>row-\d+</g)?.length ?? 0;

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

it("marks only a header that has a defined term", () => {
  type Gap = { gap: number; other: number };
  const helper = createColumnHelper<Gap>();
  const markup = renderToStaticMarkup(
    <Tooltip.Provider>
      <Eu5DataTable
        columns={[
          helper.accessor("gap", {
            meta: Eu5DataTable.meta({ headerLabel: "Gap", variant: "num", term: "taxGap" }),
          }),
          helper.accessor("other", {
            meta: Eu5DataTable.meta({ headerLabel: "Tax Gap", variant: "num" }),
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

const location = { key: 4, name: "Paris" };
const rows = [
  {
    location,
    building: { key: "farm" },
    foreignOwner: { tag: "FRA", country: { key: 1 } },
    value: 10,
  },
  {
    location,
    building: { key: "port" },
    foreignOwner: { tag: "FRA", country: { key: 1 } },
    value: 20,
  },
  {
    location,
    building: { key: "farm" },
    foreignOwner: { tag: "ENG", country: { key: 2 } },
    value: 30,
  },
];
function renderedBuildingKeys(data: typeof rows) {
  const html = renderToStaticMarkup(
    <Eu5DataTable data={data} columns={[{ accessorKey: "value" }]} />,
  );
  return [...html.matchAll(/data-row-key="([^"]+)"/g)].map((match) => match[1]);
}

it("keeps foreign building rows distinct when they share a location", () => {
  const ids = renderedBuildingKeys(rows);
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(3);
  expect(renderedBuildingKeys([...rows].reverse())).toEqual([...ids].reverse());
});

it("uses canonical location keys rather than potentially repeated display names", () => {
  const ids = renderedBuildingKeys([rows[0], { ...rows[0], location: { key: 5, name: "Paris" } }]);
  expect(ids[0]).not.toBe(ids[1]);
  expect(renderedBuildingKeys([{ ...rows[0], value: 99 }])[0]).toBe(ids[0]);
});

it("handles rows with kind, culture, and missing religion without throwing", () => {
  const html = renderToStaticMarkup(
    <Eu5DataTable
      data={[{ kind: "peasants", culture: undefined, religion: undefined, value: 12 }]}
      columns={[{ accessorKey: "kind" }, { accessorKey: "value" }]}
    />,
  );
  expect(html).toContain("peasants");
  // Only the numeric cell mounts the change-highlight overlay span.
  expect(html.match(/pointer-events-none absolute inset-0 opacity-0/g)?.length).toBe(1);
});

it("keeps foreign owner cells distinct by owner+building and keeps location identity stable across market changes", () => {
  const ownerHtml = renderToStaticMarkup(
    <Eu5DataTable
      data={[
        { owner: { country: { key: 1 } }, building: { key: "farm" }, levels: 5 },
        { owner: { country: { key: 2 } }, building: { key: "farm" }, levels: 8 },
      ]}
      columns={[{ accessorKey: "levels" }]}
    />,
  );
  const ownerIds = [...ownerHtml.matchAll(/data-row-key="([^"]+)"/g)].map((m) => m[1]);
  expect(new Set(ownerIds).size).toBe(2);

  const locRowA = { location: { key: 42 }, market: { market: { key: 1 } }, value: 10 };
  const locRowB = { location: { key: 42 }, market: { market: { key: 2 } }, value: 12 };
  const locKey = (row: typeof locRowA) =>
    renderToStaticMarkup(<Eu5DataTable data={[row]} columns={[{ accessorKey: "value" }]} />).match(
      /data-row-key="([^"]+)"/,
    )?.[1];
  expect(locKey(locRowA)).toBe(locKey(locRowB));
});
