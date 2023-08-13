import React, { useMemo, useState } from "react";
import { Table } from "./Table";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "./Button";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { cx } from "class-variance-authority";

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  pagination?: boolean;
  summary?: React.ReactNode;
  initialSorting?: SortingState;
}

export function DataTable<TData extends Object & Partial<{ rowSpan: number }>>({
  data,
  columns,
  pagination,
  summary,
  initialSorting = [],
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const state = useMemo(
    () => ({
      sorting,
      columnFilters,
      ...(!pagination && { pageIndex: 0, pageSize: 100000 }),
    }),
    [sorting, columnFilters, pagination]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: !pagination,
    state,
  });

  const rows = table.getRowModel().rows;
  return (
    <div className="flex flex-col gap-2 rounded-md">
      <Table>
        <Table.Header>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Row key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <Table.Head
                  colSpan={header.colSpan}
                  className={cx(
                    header.colSpan > 1 && "border-l border-r text-center"
                  )}
                  key={header.id}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </Table.Head>
              ))}
            </Table.Row>
          ))}
        </Table.Header>
        <Table.Body>
          {rows.length ? (
            rows.map((row) => (
              <Table.Row
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell, i) =>
                  i == 0 && cell.row.original.rowSpan === 0 ? null : (
                    <Table.Cell
                      key={cell.id}
                      rowSpan={i == 0 ? cell.row.original.rowSpan : undefined}
                      className={cx(
                        cell.column.getIsSorted() && "bg-gray-50",
                        (cell.column.columnDef?.meta as any)?.className
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </Table.Cell>
                  )
                )}
              </Table.Row>
            ))
          ) : (
            <Table.Row>
              <Table.Cell colSpan={columns.length} className="h-24 text-center">
                No results.
              </Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
        {summary ? <Table.Footer>{summary}</Table.Footer> : null}
      </Table>
      {pagination ? (
        <div className="flex items-center justify-end">
          <div className="flex items-center space-x-2">
            <Button
              shape="square"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <LeftOutlined className="h-4 w-4" />
            </Button>
            <div className="flex items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <Button
              shape="square"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <RightOutlined className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
