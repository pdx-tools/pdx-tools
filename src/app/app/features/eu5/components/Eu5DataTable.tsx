import React, { useId, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  Cell,
  ColumnDef,
  Header,
  PaginationState,
  SortingState,
  Table as TableInstance,
  TableOptions,
} from "@tanstack/react-table";
import { cva, cx } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
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
  "relative h-[30px] min-w-0 px-2 py-0 text-left align-middle font-game-num text-[10px] tracking-[0.14em] text-game-ink-500 uppercase",
  {
    variants: {
      variant: {
        default: "",
        pin: "bg-game-panel-2",
        num: "text-right",
        vis: "text-game-ink-700",
        end: "text-center",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const cellVariants = cva(
  "min-w-0 px-2 py-1.5 align-middle font-game-ui text-[12px] text-game-ink-100",
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
  "min-w-0 p-2 align-baseline font-game-num text-[11.5px] tabular-nums text-game-ink-100",
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

const sortBtnClass =
  "inline-flex h-[18px] shrink-0 items-center justify-center border-0 bg-transparent font-game-num text-[10px] text-game-ink-700 data-[active=true]:text-game-accent-100";

const headerSortBtnClass =
  "flex h-[30px] w-full min-w-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-inherit uppercase hover:text-game-ink-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-game-accent-300";

const toolBtnClass =
  "inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-(--radius-control) border border-solid border-transparent bg-transparent px-1.5 font-game-ui text-[11.5px] text-game-ink-300 hover:border-game-line hover:bg-game-panel-hover hover:text-game-ink-100";

const filterChipVariants = cva(
  "inline-flex h-[22px] items-center gap-1 rounded-(--radius-plate) border border-solid pl-1.5 font-game-ui text-[11.5px]",
  {
    variants: {
      negated: {
        true: "border-game-err/55 bg-game-err/10",
        false: "border-game-line-strong bg-game-panel",
      },
    },
    defaultVariants: { negated: false },
  },
);

type Filter = {
  field: string;
  op: string;
  value: React.ReactNode;
  negated?: boolean;
};

type SearchConfig = boolean | { placeholder?: string };

type ToolbarConfig =
  | boolean
  | {
      search?: SearchConfig;
      sort?: boolean;
      columns?: boolean;
      density?: boolean;
      summary?: boolean;
    };

type PaginationConfig =
  | boolean
  | {
      pageSize?: PageSize;
      pageSizeOptions?: readonly PageSize[];
    };

type SummaryRenderer<TData> = React.ReactNode | ((table: TableInstance<TData>) => React.ReactNode);

type Eu5DataTableOptions<TData> = Partial<
  Pick<
    TableOptions<TData>,
    | "debugAll"
    | "debugCells"
    | "debugColumns"
    | "debugHeaders"
    | "debugRows"
    | "debugTable"
    | "enableMultiSort"
    | "enableSorting"
    | "filterFns"
    | "globalFilterFn"
    | "getRowId"
    | "isMultiSortEvent"
    | "maxMultiSortColCount"
    | "sortingFns"
  >
>;

export type Eu5DataTableProps<TData extends object> = {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  className?: string;
  pagination?: PaginationConfig;
  initialSorting?: SortingState;
  title?: React.ReactNode;
  titleActions?: React.ReactNode;
  totalCount?: number;
  toolbar?: ToolbarConfig;
  summary?: SummaryRenderer<TData>;
  filters?: Filter[];
  onRemoveFilter?: (index: number) => void;
  onAddFilter?: () => void;
  /** Marker on each row for the in-filter highlight (panel-active + accent rail). */
  isRowInFilter?: (row: TData) => boolean;
  onRowHoverChange?: (row: TData | null) => void;
  onRowFocusChange?: (row: TData | null) => void;
  tableOptions?: Eu5DataTableOptions<TData>;
  /** Inject a separator before a row. Return non-null to render a full-width separator row. */
  rowSeparator?: (row: TData, index: number) => React.ReactNode | null;
};

type ResolvedPaginationConfig = {
  enabled: boolean;
  pageSize?: PageSize;
  pageSizeOptions: readonly PageSize[];
};

type ResolvedToolbarConfig = {
  search: boolean;
  searchPlaceholder: string;
  sort: boolean;
  columns: boolean;
  density: boolean;
  summary: boolean;
};

export function Eu5DataTable<TData extends object>({
  data,
  columns,
  className,
  pagination = false,
  initialSorting = [],
  title,
  titleActions,
  totalCount,
  toolbar,
  summary,
  filters,
  onRemoveFilter,
  onAddFilter,
  isRowInFilter,
  onRowHoverChange,
  onRowFocusChange,
  tableOptions,
  rowSeparator,
}: Eu5DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState("");

  const paginationConfig = normalizePaginationConfig(pagination);
  const toolbarConfig = normalizeToolbarConfig(toolbar);

  const storedPageSize = usePaginationStore((s) => s.pageSize);
  const setStoredPageSize = usePaginationStore((s) => s.setPageSize);
  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: paginationConfig.pageSize ?? storedPageSize,
  });

  const state = useMemo(
    () => ({
      sorting,
      globalFilter,
      ...(paginationConfig.enabled ? { pagination: paginationState } : {}),
    }),
    [sorting, globalFilter, paginationConfig.enabled, paginationState],
  );

  const table = useReactTable({
    ...tableOptions,
    data,
    columns,
    state,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableMultiSort: tableOptions?.enableMultiSort ?? true,
    ...(paginationConfig.enabled
      ? {
          onPaginationChange: setPaginationState,
          getPaginationRowModel: getPaginationRowModel(),
        }
      : {}),
  });

  const rows = table.getRowModel().rows;
  const needsFilteredCount =
    paginationConfig.enabled ||
    totalCount !== undefined ||
    Boolean(title || titleActions) ||
    Boolean(toolbarConfig?.search);
  const filteredCount = needsFilteredCount ? table.getFilteredRowModel().rows.length : data.length;
  const displayTotal = totalCount ?? data.length;
  const showTitleCount = totalCount !== undefined || data.length !== filteredCount;
  const summaryContent = typeof summary === "function" ? summary(table) : summary;

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

      {toolbarConfig && (
        <ToolbarBand
          config={toolbarConfig}
          search={toolbarConfig.search ? globalFilter : null}
          onSearchChange={setGlobalFilter}
          sortCount={sorting.length}
          columnCount={table.getAllLeafColumns().length}
        />
      )}

      {filters && filters.length > 0 && (
        <FilterBand filters={filters} onRemove={onRemoveFilter} onAdd={onAddFilter} />
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-full table-auto border-separate border-spacing-0">
          <ColumnGroup table={table} />
          <HeaderBand table={table} />
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getAllLeafColumns().length}
                  className="h-24 text-center font-game-ui text-[12px] text-game-ink-500"
                >
                  No results.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const inFilter = isRowInFilter?.(row.original) ?? false;
                const separator = rowSeparator?.(row.original, idx) ?? null;
                const colCount = table.getAllLeafColumns().length;
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
                        <BodyCell key={cell.id} cell={cell} />
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
          pageIndex={table.getState().pagination.pageIndex}
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

function normalizeToolbarConfig(config: ToolbarConfig | undefined): ResolvedToolbarConfig | null {
  if (config === false) return null;

  if (config === undefined) {
    return null;
  }

  if (config === true) {
    return {
      search: true,
      searchPlaceholder: "Search…",
      sort: true,
      columns: true,
      density: true,
      summary: true,
    };
  }

  const searchConfig = config.search ?? true;
  const search = searchConfig !== false;

  return {
    search,
    searchPlaceholder:
      typeof searchConfig === "object" ? (searchConfig.placeholder ?? "Search…") : "Search…",
    sort: config.sort ?? true,
    columns: config.columns ?? true,
    density: config.density ?? true,
    summary: config.summary ?? true,
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
          <span className="font-game-ui text-[13px] font-semibold text-game-ink-100">{title}</span>
        )}
        {showCount && (
          <span className="font-game-num text-[11.5px] text-game-ink-100 tabular-nums">
            {formatCount(filteredCount)}{" "}
            <span className="text-game-ink-500">of {formatCount(totalCount)}</span>
          </span>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function ToolbarBand({
  config,
  search,
  onSearchChange,
  sortCount,
  columnCount,
}: {
  config: ResolvedToolbarConfig;
  search: string | null;
  onSearchChange: (v: string) => void;
  sortCount: number;
  columnCount: number;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-solid border-game-line bg-game-panel-2 px-3 py-1.5">
      {search !== null && (
        <div className="flex h-[26px] min-w-0 flex-1 items-center gap-1.5 rounded-(--radius-control) border border-solid border-game-line-strong bg-game-page px-2">
          <span className="font-game-num text-[12px] text-game-ink-500">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={config.searchPlaceholder}
            className="min-w-0 flex-1 border-0 bg-transparent font-game-ui text-[12px] text-game-ink-100 placeholder:text-game-ink-700 focus:outline-none"
          />
        </div>
      )}
      {(config.columns || config.sort || config.density || config.summary) && (
        <div className="mx-1 h-[18px] w-px bg-game-line-strong" />
      )}
      {config.columns && (
        <ToolButton glyph="▦" label="Columns" count={`${columnCount}/${columnCount}`} />
      )}
      {config.sort && (
        <ToolButton glyph="⇅" label="Sort" count={sortCount > 0 ? String(sortCount) : undefined} />
      )}
      {config.density && <ToolButton glyph="▤" label="Density" />}
      {config.summary && <ToolButton glyph="Σ" label="Summary" />}
    </div>
  );
}

function ToolButton({ glyph, label, count }: { glyph: string; label: string; count?: string }) {
  return (
    <button type="button" className={toolBtnClass} aria-label={label} disabled>
      <span className="font-game-num text-[12px] text-game-ink-500">{glyph}</span>
      <span>{label}</span>
      {count && (
        <span className="rounded-[2px] bg-game-accent-soft px-1 py-px font-game-num text-[10px] text-game-accent-100">
          {count}
        </span>
      )}
    </button>
  );
}

function FilterBand({
  filters,
  onRemove,
  onAdd,
}: {
  filters: Filter[];
  onRemove?: (index: number) => void;
  onAdd?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-solid border-game-line bg-game-panel-2 px-3 py-1.5">
      <span className="mr-1 font-game-num text-[9.5px] tracking-[0.14em] text-game-ink-500 uppercase">
        Filter
      </span>
      {filters.map((f, i) => (
        <span
          key={`${f.field}-${i}`}
          className={filterChipVariants({ negated: f.negated ?? false })}
        >
          {f.negated && (
            <span className="font-game-ui text-[11px] font-semibold text-game-err">not</span>
          )}
          <span className="font-game-num text-[10px] tracking-[0.08em] text-game-ink-500 uppercase">
            {f.field}
          </span>
          <span className="font-game-ui text-[11px] text-game-ink-500 italic">{f.op}</span>
          <span className="font-game-num text-[11.5px] text-game-ink-100">{f.value}</span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label="remove filter"
              className="ml-1 inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center border-0 border-l border-solid border-game-line bg-transparent font-game-num text-[11px] text-game-ink-500 hover:bg-game-err/15 hover:text-game-err"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-[22px] cursor-pointer items-center gap-1 rounded-(--radius-plate) border border-dashed border-game-line-strong bg-transparent px-1.5 font-game-ui text-[11.5px] text-game-ink-500 hover:border-game-accent-line hover:text-game-accent-100"
        >
          <span>+</span>
          <span>Filter</span>
        </button>
      )}
    </div>
  );
}

function ColumnGroup<TData>({ table }: { table: TableInstance<TData> }) {
  return (
    <colgroup>
      {table.getVisibleLeafColumns().map((column) => {
        const meta = column.columnDef.meta?.eu5;
        return <col key={column.id} style={colStyle(meta?.width, meta?.minWidth)} />;
      })}
    </colgroup>
  );
}

function HeaderBand<TData>({ table }: { table: TableInstance<TData> }) {
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

function HeaderCell<TData>({ header }: { header: Header<TData, unknown> }) {
  const meta = header.column.columnDef.meta?.eu5;
  const variant: Eu5DataTableColumnVariant = meta?.variant ?? "default";
  const isPlaceholder = header.isPlaceholder;
  const canSort = header.column.getCanSort();
  const sorted = header.column.getIsSorted();
  const sortIndex = header.column.getSortIndex();
  const showRank = sorted !== false && header.column.getSortingFn() && sortIndex >= 0;
  const align = meta?.align ?? alignForVariant(variant);

  const label = meta?.headerLabel ?? header.column.columnDef.header;
  const headerContent = (
    <>
      <span
        className={cx(
          "min-w-0 overflow-hidden font-game-num text-ellipsis whitespace-nowrap",
          align === "right" && "text-right",
          align === "center" && "text-center",
        )}
      >
        {isPlaceholder
          ? null
          : typeof label === "string"
            ? label
            : flexRender(header.column.columnDef.header, header.getContext())}
      </span>
      {canSort && (
        <span
          data-active={sorted !== false || undefined}
          className={sortBtnClass}
          aria-hidden="true"
        >
          {sorted === "desc" ? "▼" : sorted === "asc" ? "▲" : "↕"}
          {showRank && sortIndex >= 0 && (
            <sup className="ml-px text-[7px] text-game-accent-100">{sortIndex + 1}</sup>
          )}
        </span>
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
      {canSort ? (
        <button
          type="button"
          aria-label={`Sort by ${headerLabelText(meta?.headerLabel, header.column.id)}`}
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
          className={cx(
            "flex h-[30px] min-w-0 items-center gap-1",
            align === "right" && "justify-end",
            align === "center" && "justify-center",
          )}
        >
          {headerContent}
        </div>
      )}
    </th>
  );
}

function BodyCell<TData>({ cell }: { cell: Cell<TData, unknown> }) {
  const meta = cell.column.columnDef.meta?.eu5;
  const variant: Eu5DataTableColumnVariant = meta?.variant ?? "default";
  const align = meta?.align ?? alignForVariant(variant);
  return (
    <td
      className={cx(cellVariants({ variant }), alignClass(align), "border-b border-game-line")}
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
          className="font-game-num text-[10.5px] tracking-[0.04em] text-game-ink-500"
        >
          Showing
        </label>
        <select
          id={selectId}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
          className="h-[22px] cursor-pointer rounded-(--radius-control) border border-solid border-game-line-strong bg-game-page px-1.5 font-game-num text-[11px] text-game-ink-100"
        >
          {pageSizeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="font-game-num text-[10.5px] tracking-[0.04em] text-game-ink-500">
          of {formatCount(totalRows)} rows
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <PagerBtn onClick={onFirst} disabled={!canPrev} label="first">
          ‹‹
        </PagerBtn>
        <PagerBtn onClick={onPrev} disabled={!canPrev} label="previous">
          ‹
        </PagerBtn>
        <span className="px-1.5 font-game-num text-[11px] text-game-ink-300">
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
      className="inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-(--radius-control) border border-solid border-game-line-strong bg-game-page font-game-num text-[11px] text-game-ink-300 hover:text-game-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
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
            "ml-1.5 font-game-num text-[10.5px]",
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
        "inline-flex h-[18px] items-center rounded-(--radius-plate) border border-solid border-game-line-strong bg-game-panel-2 px-1.5 font-game-num text-[10px] tracking-[0.04em] text-game-ink-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

const SPARK_MASKS: Record<"up" | "down" | "flat", string> = {
  up: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 20' preserveAspectRatio='none'><polyline points='0,15 15,14 30,12 45,11 60,9 75,7 90,5 105,3 120,2' fill='none' stroke='black' stroke-width='1.5'/></svg>\")",
  down: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 20' preserveAspectRatio='none'><polyline points='0,5 15,6 30,8 45,9 60,12 75,13 90,15 105,17 120,18' fill='none' stroke='black' stroke-width='1.5'/></svg>\")",
  flat: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 20' preserveAspectRatio='none'><polyline points='0,10 15,9 30,11 45,10 60,10 75,11 90,9 105,11 120,10' fill='none' stroke='black' stroke-width='1.5'/></svg>\")",
};

function Sparkline({ trend }: { trend: "up" | "down" | "flat" }) {
  const colorClass =
    trend === "up" ? "bg-game-good" : trend === "down" ? "bg-game-err" : "bg-game-ink-500";
  return (
    <span className="relative block h-5 w-full overflow-hidden rounded-[1px]">
      <span
        className={cx("absolute inset-0 opacity-80", colorClass)}
        style={{
          maskImage: SPARK_MASKS[trend],
          WebkitMaskImage: SPARK_MASKS[trend],
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
      />
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
  return (
    <span className="font-game-num text-[9.5px] tracking-[0.14em] text-game-ink-500 uppercase">
      {children}
    </span>
  );
}

function SummaryMeta({ children }: { children: React.ReactNode }) {
  return <span className="font-game-num text-[10px] text-game-ink-500">{children}</span>;
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

function formatCount(n: number): string {
  return n.toLocaleString();
}

Eu5DataTable.NumericCell = NumericCell;
Eu5DataTable.RatioCell = RatioCell;
Eu5DataTable.Pill = Pill;
Eu5DataTable.Sparkline = Sparkline;
Eu5DataTable.Affordance = Affordance;
Eu5DataTable.SummaryRow = SummaryRow;
Eu5DataTable.SummaryCell = SummaryCell;
Eu5DataTable.SummaryLabel = SummaryLabel;
Eu5DataTable.SummaryMeta = SummaryMeta;
Eu5DataTable.meta = eu5Meta;

export type Eu5DataTableFilter = Filter;
export type Eu5DataTableHeaderVariants = VariantProps<typeof headColVariants>;
export type { Eu5DataTableColumnMeta, Eu5DataTableColumnVariant };
