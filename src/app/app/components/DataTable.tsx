import React, { ComponentProps, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Table } from "./Table";
import {
  Column,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  TableOptions,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  ColumnOrderState,
  AccessorKeyColumnDefBase,
  Cell,
} from "@tanstack/react-table";
import { Button } from "./Button";
import { cx } from "class-variance-authority";
import { Input } from "./Input";

type DataTableProps<TData> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[];
  data: TData[];
  pagination?: boolean;
  summary?: React.ReactNode;
  initialSorting?: SortingState;
  className?: string;
  enableColumnReordering?: boolean;
} & Partial<TableOptions<TData>> &
  ComponentProps<typeof Table>;

export function DataTable<TData extends object & Partial<{ rowSpan: number }>>({
  data,
  columns,
  pagination,
  summary,
  initialSorting = [],
  className,
  enableColumnFilters = false,
  enableColumnReordering = false,
  size,
  ...options
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    columns.map((col) =>
      String((col as AccessorKeyColumnDefBase<TData, void>).accessorKey),
    ),
  );

  const state = useMemo(
    () => ({
      sorting,
      columnFilters,
      columnOrder: enableColumnReordering ? columnOrder : undefined,
      ...(!pagination && { pageIndex: 0, pageSize: 100000 }),
    }),
    [sorting, columnFilters, pagination, columnOrder, enableColumnReordering],
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
    onColumnOrderChange: enableColumnReordering ? setColumnOrder : undefined,
    manualPagination: !pagination,
    state,
    enableColumnFilters,
    ...options,
  });

  const rows = table.getRowModel().rows;

  // Drag and drop handlers
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);

  const handleDragStart = (
    e: React.DragEvent<HTMLTableCellElement>,
    columnId: string,
  ) => {
    if (!enableColumnReordering) return;
    setDraggedColumnId(columnId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (
    e: React.DragEvent<HTMLTableCellElement>,
    columnId: string,
  ) => {
    if (!enableColumnReordering) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // Prevent unnecessary state updates if the column is already hovered
    if (
      draggedColumnId &&
      draggedColumnId !== columnId &&
      hoveredColumnId !== columnId
    ) {
      setHoveredColumnId(columnId);
    }
  };

  const handleDrop = (
    e: React.DragEvent<HTMLTableCellElement>,
    targetColumnId: string,
  ) => {
    if (
      !enableColumnReordering ||
      !draggedColumnId ||
      draggedColumnId === targetColumnId
    )
      return;

    e.preventDefault();

    // Get current column order
    const newColumnOrder = [...columnOrder];

    // Find positions
    const draggedIndex = newColumnOrder.findIndex(
      (id) => id === draggedColumnId,
    );
    const targetIndex = newColumnOrder.findIndex((id) => id === targetColumnId);

    // Remove dragged column from array
    newColumnOrder.splice(draggedIndex, 1);

    // Insert at new position
    newColumnOrder.splice(targetIndex, 0, draggedColumnId);

    // Update state
    setColumnOrder(newColumnOrder);
    setDraggedColumnId(null);
    setHoveredColumnId(null);
  };

  const handleDragEnd = () => {
    setDraggedColumnId(null);
    setHoveredColumnId(null);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLTableCellElement>) => {
    // Only clear the hovered state if we're actually leaving the cell
    // and not just entering a child element
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setHoveredColumnId(null);
  };

  return (
    <div className={cx("flex flex-col gap-2 rounded-md", className)}>
      <Table size={size}>
        <Table.Header>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Row key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <Table.Head
                  colSpan={header.colSpan}
                  className={cx(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (header.column.columnDef?.meta as any)?.headClassName,
                    header.colSpan > 1 &&
                      "border-l border-r text-center dark:border-gray-600",
                    enableColumnReordering && "relative",
                    enableColumnReordering &&
                      draggedColumnId !== header.column.id &&
                      "cursor-grab",
                    enableColumnReordering &&
                      draggedColumnId === header.column.id &&
                      "cursor-grabbing opacity-50",
                    enableColumnReordering &&
                      draggedColumnId &&
                      draggedColumnId !== header.column.id &&
                      hoveredColumnId === header.column.id &&
                      "bg-blue-100 transition-colors duration-200 dark:bg-slate-700",
                  )}
                  key={header.id}
                  draggable={enableColumnReordering}
                  onDragStart={
                    enableColumnReordering
                      ? (e) => handleDragStart(e, header.column.id)
                      : undefined
                  }
                  onDragOver={
                    enableColumnReordering
                      ? (e) => handleDragOver(e, header.column.id)
                      : undefined
                  }
                  onDragLeave={
                    enableColumnReordering
                      ? (e) => handleDragLeave(e)
                      : undefined
                  }
                  onDrop={
                    enableColumnReordering
                      ? (e) => handleDrop(e, header.column.id)
                      : undefined
                  }
                  onDragEnd={enableColumnReordering ? handleDragEnd : undefined}
                >
                  {/* Add visual indicator for the drop target */}
                  {enableColumnReordering &&
                    draggedColumnId &&
                    hoveredColumnId === header.column.id && (
                      <div className="pointer-events-none absolute inset-0 z-10">
                        <div className="absolute bottom-0 left-0 top-0 w-1 bg-blue-500"></div>
                      </div>
                    )}

                  <div
                    className={cx(
                      "relative z-20",
                      draggedColumnId && "pointer-events-none",
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    {header.column.getCanFilter() ? (
                      <Filter column={header.column} />
                    ) : null}
                  </div>
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
                      className={cellClassName<TData>(cell)}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </Table.Cell>
                  ),
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
              <ChevronLeftIcon className="h-4 w-4" />
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
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function cellClassName<TData>(cell: Cell<TData, void>): string | undefined {
  let cz = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const className = (cell.column.columnDef?.meta as any)?.className;
  if (typeof className === "function") {
    // Don't add sorted clsas name if the controller
    cz = className(cell.getValue());
  } else if (typeof className === "string") {
    cz = cx(
      cell.column.getIsSorted() && "bg-gray-50 dark:bg-slate-700",
      className,
    );
  }

  return cz;
}

function Filter<TData>({ column }: { column: Column<TData, unknown> }) {
  const columnFilterValue = column.getFilterValue();
  return (
    <Input
      type="text"
      value={`${columnFilterValue ?? ""}`}
      onChange={(value) => column.setFilterValue(value.currentTarget.value)}
      placeholder={`Search...`}
      className="pl-1"
    />
  );
}
