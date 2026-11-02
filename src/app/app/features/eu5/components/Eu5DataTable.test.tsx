import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable } from "./Eu5DataTable";

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
