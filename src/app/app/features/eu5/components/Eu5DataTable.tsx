import { DefinedTerm, definedTermMark } from "./EntityName";
import React, { useId, useMemo, useState } from "react";
import { flexRender, useTable } from "@tanstack/react-table";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import type {
  AppCell,
  AppColumnDef,
  AppHeader,
  AppRow,
  AppTable,
  AppTableOptions,
  RowData,
} from "@/lib/tanstack-table";
import { appTableFeatures } from "@/lib/tanstack-table";
import { cva, cx } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { focusRing, focusRingInset } from "@/components/game/focusRing";
import { sectionLabel } from "@/components/game/SectionTitle";
import { formatInt } from "@/lib/format";
import { formatExact, formatExactAmount } from "../numberFormatting";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Eu5DataTableColumnMeta, Eu5DataTableColumnVariant } from "@/types/tanstack-table";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = number;

interface PaginationSettings {
  pageSize: PageSize;
  setPageSize: (size: PageSize) => void;
}

const usePaginationStore = create<PaginationSettings>()(
  persist(
    (set) => ({
      pageSize: 25,
      setPageSize: (pageSize) => set({ pageSize }),
    }),
    { name: "pdx-tools-eu5-data-table" },
  ),
);

const headColVariants = cva(
  cx("relative h-[30px] min-w-0 px-2 py-0 text-left align-middle max-md:h-11", sectionLabel),
  {
    variants: {
      variant: {
        default: "",
        pin: "bg-game-panel-2",
        num: "text-right",
        vis: "text-game-ink-500",
        end: "text-center",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const cellVariants = cva(
  "h-[30px] min-w-0 px-2 py-0.5 align-middle font-game-ui text-[12px] text-game-ink-100 max-md:h-11",
  {
    variants: {
      variant: {
        default: "",
        pin: "bg-inherit",
        num: "text-right font-game-num tabular-nums",
        vis: "",
        end: "p-1 text-center",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const summaryCellVariants = cva(
  "min-w-0 p-2 align-baseline font-game-num text-[12px] tabular-nums text-game-ink-100",
  {
    variants: {
      variant: {
        default: "",
        pin: "",
        num: "text-right",
        vis: "",
        end: "",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

/**
 * A cell with a full value behind its figure. The value shows over the cell on
 * hover and on focus, which is also a tap on a touch screen. The table has one
 * tab stop for its cells, and the arrow keys move from cell to cell.
 */
const exactCell = cx(
  "relative after:pointer-events-none after:absolute after:right-1 after:bottom-full after:z-20",
  "after:rounded-plate after:border after:border-solid after:border-game-line-strong after:bg-game-panel-2",
  "after:px-1.5 after:py-0.5 after:font-game-num after:text-[12px] after:whitespace-nowrap after:text-game-ink-100",
  "after:opacity-0 after:transition-opacity after:content-[attr(data-exact)]",
  "hover:after:opacity-100 hover:after:delay-300 focus:after:opacity-100 data-dismissed:after:hidden",
  focusRingInset,
);

/** The full value of a cell, if its figure can hide one */
export function exactCellValue(
  value: unknown,
  meta: Eu5DataTableColumnMeta | undefined,
): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (meta?.exact) return meta.exact(value);
  if (meta?.variant !== "num") return undefined;
  // A cell rounds a tiny value to 0.0, so the full value says that it is not zero.
  return value !== 0 && Math.abs(value) < 0.005 ? formatExact(value) : formatExactAmount(value);
}

/**
 * The next cell with a full value from `cell` in the direction of an arrow key. Left
 * and right go through the rows in reading order, so they reach each such cell. Up and
 * down stay in the column.
 */
function nextExactCell(cell: HTMLTableCellElement, key: string): HTMLElement | null {
  const row = cell.parentElement;
  if (!(row instanceof HTMLTableRowElement)) return null;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const cells = [...(row.parentElement?.querySelectorAll("td[data-exact]") ?? [])];
    const next = cells[cells.indexOf(cell) + (key === "ArrowLeft" ? -1 : 1)];
    return next instanceof HTMLElement ? next : null;
  }
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;
  const step = key === "ArrowUp" ? "previousElementSibling" : "nextElementSibling";
  for (let next = row[step]; next instanceof HTMLTableRowElement; next = next[step]) {
    const below = next.cells[cell.cellIndex];
    if (below?.dataset.exact !== undefined) return below;
  }
  return null;
}

function onExactCellKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>) {
  const cell = event.target;
  if (!(cell instanceof HTMLTableCellElement) || cell.dataset.exact === undefined) return;
  // The full value can cover other text. The first Escape hides it, and only that.
  if (event.key === "Escape" && cell.dataset.dismissed === undefined) {
    cell.dataset.dismissed = "";
    event.stopPropagation();
    return;
  }
  const next = nextExactCell(cell, event.key);
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function restoreExactValue(event: React.FocusEvent<HTMLTableSectionElement>) {
  delete event.target.dataset.dismissed;
}

const sortBtnClass =
  "inline-flex h-[1em] shrink-0 items-center justify-center self-center border-0 bg-transparent font-game-ui text-[9px] leading-none text-game-ink-500 data-[active=true]:text-game-accent-100";

/** The one sign of a sort: a filled triangle when a column sorts, and a dim ↕ when it can. */
function SortMark({
  sorted,
  children,
}: {
  sorted: false | "asc" | "desc";
  children?: React.ReactNode;
}) {
  return (
    <span data-active={sorted !== false || undefined} className={sortBtnClass} aria-hidden="true">
      {sorted === "desc" ? "▼" : sorted === "asc" ? "▲" : "↕"}
      {children}
    </span>
  );
}

const headerSortBtnClass = cx(
  "flex h-[30px] w-full min-w-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-inherit uppercase hover:text-game-ink-100 max-md:h-11",
  focusRing,
);

type PaginationConfig =
  | boolean
  | {
      pageSize?: PageSize;
      pageSizeOptions?: readonly PageSize[];
    };

type SummaryRenderer<TData extends RowData> =
  | React.ReactNode
  | ((table: AppTable<TData>) => React.ReactNode);

type Eu5DataTableOptions<TData extends RowData> = Partial<
  Pick<
    AppTableOptions<TData>,
    | "debugAll"
    | "debugCells"
    | "debugColumns"
    | "debugHeaders"
    | "debugRows"
    | "debugTable"
    | "enableMultiSort"
    | "enableSorting"
    | "getRowId"
    | "isMultiSortEvent"
    | "maxMultiSortColCount"
  >
>;

export type Eu5DataTableProps<TData extends RowData> = {
  columns: AppColumnDef<TData, any>[];
  data: TData[];
  className?: string;
  pagination?: PaginationConfig;
  initialSorting?: SortingState;
  title?: React.ReactNode;
  titleActions?: React.ReactNode;
  totalCount?: number;
  summary?: SummaryRenderer<TData>;
  /** Marker on each row for the in-filter highlight (panel-active + accent rail). */
  isRowInFilter?: (row: TData) => boolean;
  onRowHoverChange?: (row: TData | null) => void;
  onRowFocusChange?: (row: TData | null) => void;
  tableOptions?: Eu5DataTableOptions<TData>;
  /** Return content to insert before a row; `sorted` indicates an applied sort. */
  rowSeparator?: (row: TData, index: number, ctx: { sorted: boolean }) => React.ReactNode | null;
};

type ResolvedPaginationConfig = {
  enabled: boolean;
  pageSize?: PageSize;
  pageSizeOptions: readonly PageSize[];
};

export function Eu5DataTable<TData extends RowData>({
  data,
  columns,
  className,
  pagination = false,
  initialSorting = [],
  title,
  titleActions,
  totalCount,
  summary,
  isRowInFilter,
  onRowHoverChange,
  onRowFocusChange,
  tableOptions,
  rowSeparator,
}: Eu5DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  const paginationConfig = normalizePaginationConfig(pagination);

  const storedPageSize = usePaginationStore((s) => s.pageSize);
  const setStoredPageSize = usePaginationStore((s) => s.setPageSize);
  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: paginationConfig.pageSize ?? storedPageSize,
  });

  const state = useMemo(
    () => ({
      sorting,
      ...(paginationConfig.enabled ? { pagination: paginationState } : {}),
    }),
    [sorting, paginationConfig.enabled, paginationState],
  );

  const table = useTable({
    ...tableOptions,
    data,
    columns: columns as unknown as AppColumnDef<TData, unknown>[],
    features: appTableFeatures,
    // TanStack's built-in default header renders the accessor key, which
    // would win over `meta.headerLabel` because it is a function.
    defaultColumn: {
      header: ({ column }) => column.columnDef.meta?.eu5?.headerLabel ?? column.id,
    },
    state,
    onSortingChange: setSorting,
    enableMultiSort: tableOptions?.enableMultiSort ?? true,
    // Without this, a table without pages still shows only the default page of 10 rows.
    manualPagination: !paginationConfig.enabled,
    ...(paginationConfig.enabled
      ? {
          onPaginationChange: setPaginationState,
        }
      : {}),
  });

  const rows = table.getRowModel().rows;
  const filteredCount = data.length;
  const displayTotal = totalCount ?? data.length;
  const showTitleCount = totalCount !== undefined || data.length !== filteredCount;
  const summaryContent = typeof summary === "function" ? summary(table) : summary;
  const exactStop = firstExactCellId(rows);

  return (
    <div
      className={cx(
        "flex flex-col overflow-hidden rounded-(--radius-panel) border border-solid border-game-line-strong bg-game-panel",
        className,
      )}
    >
      {(title || titleActions || totalCount !== undefined) && (
        <TitleBand
          title={title}
          actions={titleActions}
          filteredCount={filteredCount}
          totalCount={displayTotal}
          showCount={showTitleCount}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-full table-auto border-separate border-spacing-0">
          <ColumnGroup table={table} />
          <HeaderBand table={table} />
          <tbody onKeyDown={onExactCellKeyDown} onBlur={restoreExactValue}>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center font-game-ui text-[12px] text-game-ink-500"
                >
                  No results.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const inFilter = isRowInFilter?.(row.original) ?? false;
                const separator =
                  rowSeparator?.(row.original, idx, { sorted: sorting.length > 0 }) ?? null;
                const colCount = table.getVisibleLeafColumns().length;
                return (
                  <React.Fragment key={row.id}>
                    {separator !== null && (
                      <tr>
                        <td colSpan={colCount} className="p-0">
                          {separator}
                        </td>
                      </tr>
                    )}
                    <tr
                      data-in-filter={inFilter || undefined}
                      onMouseEnter={
                        onRowHoverChange ? () => onRowHoverChange(row.original) : undefined
                      }
                      onMouseLeave={onRowHoverChange ? () => onRowHoverChange(null) : undefined}
                      onFocus={
                        onRowFocusChange
                          ? (event) => {
                              if (
                                event.currentTarget.contains(event.relatedTarget as Node | null)
                              ) {
                                return;
                              }
                              onRowFocusChange(row.original);
                            }
                          : undefined
                      }
                      onBlur={
                        onRowFocusChange
                          ? (event) => {
                              if (
                                event.currentTarget.contains(event.relatedTarget as Node | null)
                              ) {
                                return;
                              }
                              onRowFocusChange(null);
                            }
                          : undefined
                      }
                      className={cx(
                        "bg-game-panel transition-colors duration-75 hover:bg-game-panel-hover",
                        "data-[in-filter=true]:bg-game-panel-active data-[in-filter=true]:hover:bg-game-panel-active",
                        "data-[in-filter=true]:shadow-[inset_2px_0_0_var(--color-game-accent-300)]",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <BodyCell key={cell.id} cell={cell} tabStop={cell.id === exactStop} />
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
          {summaryContent && <SummaryBand>{summaryContent}</SummaryBand>}
        </table>
      </div>

      {paginationConfig.enabled && (
        <FooterBand
          pageSize={paginationState.pageSize}
          pageSizeOptions={paginationConfig.pageSizeOptions}
          onPageSizeChange={(s) => {
            setStoredPageSize(s);
            setPaginationState((p) => ({ ...p, pageSize: s, pageIndex: 0 }));
          }}
          pageIndex={table.state.pagination.pageIndex}
          pageCount={table.getPageCount()}
          totalRows={filteredCount}
          canPrev={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
          onFirst={() => table.setPageIndex(0)}
          onPrev={() => table.previousPage()}
          onNext={() => table.nextPage()}
          onLast={() => table.setPageIndex(table.getPageCount() - 1)}
        />
      )}
    </div>
  );
}

function normalizePaginationConfig(config: PaginationConfig): ResolvedPaginationConfig {
  if (config === false) {
    return { enabled: false, pageSizeOptions: PAGE_SIZE_OPTIONS };
  }

  if (config === true) {
    return { enabled: true, pageSizeOptions: PAGE_SIZE_OPTIONS };
  }

  return {
    enabled: true,
    pageSize: config.pageSize,
    pageSizeOptions: config.pageSizeOptions ?? PAGE_SIZE_OPTIONS,
  };
}

function TitleBand({
  title,
  actions,
  filteredCount,
  totalCount,
  showCount,
}: {
  title: React.ReactNode;
  actions: React.ReactNode;
  filteredCount: number;
  totalCount: number;
  showCount: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-solid border-game-line px-4 py-3">
      <div className="flex items-center gap-2">
        {title && (
          <span className="font-game-ui text-[12.5px] font-semibold text-game-ink-100">
            {title}
          </span>
        )}
        {showCount && (
          <span className="font-game-num text-[12px] text-game-ink-100 tabular-nums">
            {formatInt(filteredCount)}{" "}
            <span className="text-game-ink-500">of {formatInt(totalCount)}</span>
          </span>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function ColumnGroup<TData extends RowData>({ table }: { table: AppTable<TData> }) {
  return (
    <colgroup>
      {table.getVisibleLeafColumns().map((column) => {
        const meta = column.columnDef.meta?.eu5;
        return <col key={column.id} style={colStyle(meta?.width, meta?.minWidth)} />;
      })}
    </colgroup>
  );
}

function HeaderBand<TData extends RowData>({ table }: { table: AppTable<TData> }) {
  return (
    <thead className="sticky top-0 z-2 bg-game-panel-2">
      {table.getHeaderGroups().map((group) => (
        <tr key={group.id}>
          {group.headers.map((header) => (
            <HeaderCell key={header.id} header={header} />
          ))}
        </tr>
      ))}
    </thead>
  );
}

function HeaderCell<TData extends RowData>({ header }: { header: AppHeader<TData> }) {
  const meta = header.column.columnDef.meta?.eu5;
  const variant: Eu5DataTableColumnVariant = meta?.variant ?? "default";
  const isPlaceholder = header.isPlaceholder;
  const canSort = header.column.getCanSort();
  const sorted = header.column.getIsSorted();
  const sortIndex = header.column.getSortIndex();
  const showRank = sorted !== false && header.column.getSortFn() && sortIndex >= 0;
  const sortCount = (header.headerGroup?.headers ?? []).filter(
    (other) => other.column.getIsSorted() !== false,
  ).length;
  const align = meta?.align ?? alignForVariant(variant);

  const headerDef = header.column.columnDef.header;
  const rendersOwnHeader = typeof headerDef === "function";
  const label =
    meta?.headerLabel ?? (rendersOwnHeader ? undefined : (headerDef as React.ReactNode));
  const sortLabel = meta?.headerLabel ?? (typeof headerDef === "string" ? headerDef : undefined);
  const headerContent = (
    <>
      <span
        className={cx(
          "min-w-0 overflow-hidden font-game-num text-ellipsis whitespace-nowrap",
          align === "right" && "text-right",
          align === "center" && "text-center",
          definedTermMark(sortLabel),
        )}
      >
        {isPlaceholder
          ? null
          : rendersOwnHeader
            ? flexRender(headerDef, header.getContext())
            : label}
      </span>
      {canSort && (
        <SortMark sorted={sorted}>
          {/* The order number means something only when a second sort is active. */}
          {showRank && sortCount > 1 && (
            <span className="ml-px text-[12px] text-game-accent-100">{sortIndex + 1}</span>
          )}
        </SortMark>
      )}
    </>
  );

  return (
    <th
      colSpan={header.colSpan}
      scope="col"
      aria-sort={canSort ? ariaSort(sorted) : undefined}
      className={cx(
        headColVariants({ variant }),
        alignClass(align),
        "border-b border-game-line-strong",
      )}
      style={cellStyle(meta?.minWidth)}
    >
      <DefinedTerm label={sortLabel}>
        {canSort ? (
          <button
            type="button"
            aria-label={`Sort by ${headerLabelText(sortLabel, header.column.id)}`}
            onClick={header.column.getToggleSortingHandler()}
            className={cx(
              headerSortBtnClass,
              align === "right" && "justify-end text-right",
              align === "center" && "justify-center text-center",
            )}
          >
            {headerContent}
          </button>
        ) : (
          <div
            tabIndex={definedTermMark(sortLabel) ? 0 : undefined}
            className={cx(
              "flex h-[30px] min-w-0 items-center gap-1 max-md:h-11",
              align === "right" && "justify-end",
              align === "center" && "justify-center",
              definedTermMark(sortLabel) && focusRing,
            )}
          >
            {headerContent}
          </div>
        )}
      </DefinedTerm>
    </th>
  );
}

function firstExactCellId<TData extends RowData>(rows: AppRow<TData>[]): string | undefined {
  for (const row of rows) {
    for (const cell of row.getVisibleCells()) {
      if (exactCellValue(cell.getValue(), cell.column.columnDef.meta?.eu5)) return cell.id;
    }
  }
  return undefined;
}

function BodyCell<TData extends RowData>({
  cell,
  tabStop,
}: {
  cell: AppCell<TData>;
  tabStop: boolean;
}) {
  const meta = cell.column.columnDef.meta?.eu5;
  const variant: Eu5DataTableColumnVariant = meta?.variant ?? "default";
  const align = meta?.align ?? alignForVariant(variant);
  const exact = exactCellValue(cell.getValue(), meta);
  return (
    <td
      className={cx(
        cellVariants({ variant }),
        alignClass(align),
        "border-b border-game-line",
        exact && exactCell,
      )}
      data-exact={exact}
      aria-description={exact}
      tabIndex={exact ? (tabStop ? 0 : -1) : undefined}
      style={cellStyle(meta?.minWidth)}
    >
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>
  );
}

function SummaryBand({ children }: { children: React.ReactNode }) {
  return (
    <tfoot className="border-t border-solid border-game-line-strong bg-game-panel-2 font-game-num">
      {children}
    </tfoot>
  );
}

function FooterBand({
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  pageIndex,
  pageCount,
  totalRows,
  canPrev,
  canNext,
  onFirst,
  onPrev,
  onNext,
  onLast,
}: {
  pageSize: number;
  pageSizeOptions: readonly PageSize[];
  onPageSizeChange: (s: PageSize) => void;
  pageIndex: number;
  pageCount: number;
  totalRows: number;
  canPrev: boolean;
  canNext: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
}) {
  const selectId = useId();
  return (
    <div className="flex items-center justify-between border-t border-solid border-game-line bg-game-panel-2 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={selectId}
          className="font-game-num text-[12px] tracking-[0.04em] text-game-ink-500"
        >
          Showing
        </label>
        <select
          id={selectId}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
          className="h-[22px] cursor-pointer rounded-control border border-solid border-game-line-strong bg-game-page px-1.5 font-game-num text-[12px] text-game-ink-100 max-md:h-9"
        >
          {pageSizeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="font-game-num text-[12px] tracking-[0.04em] text-game-ink-500">
          of {formatInt(totalRows)} rows
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <PagerBtn onClick={onFirst} disabled={!canPrev} label="first">
          ‹‹
        </PagerBtn>
        <PagerBtn onClick={onPrev} disabled={!canPrev} label="previous">
          ‹
        </PagerBtn>
        <span className="px-1.5 font-game-num text-[12px] text-game-ink-300">
          Page <b className="text-game-ink-100">{pageIndex + 1}</b> of {Math.max(1, pageCount)}
        </span>
        <PagerBtn onClick={onNext} disabled={!canNext} label="next">
          ›
        </PagerBtn>
        <PagerBtn onClick={onLast} disabled={!canNext} label="last">
          ››
        </PagerBtn>
      </div>
    </div>
  );
}

function PagerBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-control border border-solid border-game-line-strong bg-game-page font-game-num text-[12px] text-game-ink-300 hover:text-game-ink-100 disabled:cursor-not-allowed disabled:opacity-40 max-md:h-9 max-md:w-9"
    >
      {children}
    </button>
  );
}

type NumericCellProps = React.HTMLAttributes<HTMLSpanElement> & {
  delta?: { value: React.ReactNode; direction: "up" | "down" | "flat" };
};

function NumericCell({ children, delta, className, ...rest }: NumericCellProps) {
  return (
    <span className={cx("font-game-num tabular-nums", className)} {...rest}>
      {children}
      {delta && (
        <span
          className={cx(
            "ml-1.5 font-game-num text-[12px]",
            delta.direction === "up" && "text-game-good",
            delta.direction === "down" && "text-game-err",
            delta.direction === "flat" && "text-game-ink-500",
          )}
        >
          {delta.value}
        </span>
      )}
    </span>
  );
}

function RatioCell({
  numerator,
  denominator,
}: {
  numerator: React.ReactNode;
  denominator: React.ReactNode;
}) {
  return (
    <span className="font-game-num tabular-nums">
      {numerator} / <span className="text-game-ink-500">{denominator}</span>
    </span>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-[18px] items-center rounded-plate border border-solid border-game-line-strong bg-game-panel-2 px-1.5 font-game-num text-[12px] tracking-[0.04em] text-game-ink-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

type AffordanceProps = {
  kind: "add" | "remove";
  onClick?: () => void;
  label?: string;
};

function Affordance({ kind, onClick, label }: AffordanceProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? (kind === "add" ? "add to filter" : "remove from filter")}
      title={label ?? (kind === "add" ? "add to filter" : "remove from filter")}
      className={cx(
        "inline-flex h-5 w-5 cursor-pointer items-center justify-center border-0 bg-transparent font-game-num text-[12px] text-game-ink-500",
        kind === "add" && "hover:text-game-accent-100",
        kind === "remove" && "hover:text-game-err",
      )}
    >
      {kind === "add" ? "+" : "×"}
    </button>
  );
}

function SummaryRow({ children }: { children: React.ReactNode }) {
  return <tr>{children}</tr>;
}

function SummaryCell({
  children,
  variant = "default",
  minWidth,
  align,
  className,
}: {
  children?: React.ReactNode;
  variant?: Eu5DataTableColumnVariant;
  minWidth?: number | string;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const resolvedAlign = align ?? alignForVariant(variant);
  return (
    <td
      className={cx(summaryCellVariants({ variant }), alignClass(resolvedAlign), className)}
      style={cellStyle(minWidth)}
    >
      {children}
    </td>
  );
}

function SummaryLabel({ children }: { children: React.ReactNode }) {
  return <span className={sectionLabel}>{children}</span>;
}

function SummaryMeta({ children }: { children: React.ReactNode }) {
  return <span className="font-game-num text-[12px] text-game-ink-500">{children}</span>;
}

function eu5Meta(meta: Eu5DataTableColumnMeta): { eu5: Eu5DataTableColumnMeta } {
  return { eu5: meta };
}

function colStyle(
  width: number | string | undefined,
  minWidth: number | string | undefined,
): React.CSSProperties | undefined {
  if (width === undefined && minWidth === undefined) return undefined;
  return {
    width: cssSize(width),
    minWidth: cssSize(minWidth),
  };
}

function cellStyle(minWidth: number | string | undefined): React.CSSProperties | undefined {
  if (minWidth === undefined) return undefined;
  return { minWidth: cssSize(minWidth) };
}

function cssSize(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

function alignForVariant(variant: Eu5DataTableColumnVariant): "left" | "right" | "center" {
  if (variant === "num") return "right";
  if (variant === "end") return "center";
  return "left";
}

function alignClass(align: "left" | "right" | "center"): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function ariaSort(sorted: false | "asc" | "desc"): "ascending" | "descending" | "none" {
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

function headerLabelText(label: string | undefined, fallback: string): string {
  return typeof label === "string" ? label : fallback;
}

Eu5DataTable.NumericCell = NumericCell;
Eu5DataTable.RatioCell = RatioCell;
Eu5DataTable.Pill = Pill;
Eu5DataTable.Affordance = Affordance;
Eu5DataTable.SummaryRow = SummaryRow;
Eu5DataTable.SummaryCell = SummaryCell;
Eu5DataTable.SummaryLabel = SummaryLabel;
Eu5DataTable.SummaryMeta = SummaryMeta;
Eu5DataTable.meta = eu5Meta;

export type Eu5DataTableHeaderVariants = VariantProps<typeof headColVariants>;
export type { Eu5DataTableColumnMeta, Eu5DataTableColumnVariant };
