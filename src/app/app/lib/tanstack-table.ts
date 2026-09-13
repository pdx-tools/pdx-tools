import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createColumnHelper as createTanstackColumnHelper,
  filterFn_arrIncludes,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures as createTableFeatures,
} from "@tanstack/react-table";
import type {
  AccessorFn,
  Cell,
  CellData,
  Column,
  ColumnDef,
  DeepKeys,
  DeepValue,
  DisplayColumnDef,
  GroupColumnDef,
  Header,
  IdentifiedColumnDef,
  Row,
  RowData,
  SortFn,
  Table,
  TableOptions,
} from "@tanstack/react-table";

export const appTableFeatures = createTableFeatures({
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { arrIncludes: filterFn_arrIncludes },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
});

export type AppTableFeatures = typeof appTableFeatures;

type AppGroupColumnDef<TData extends RowData> = Omit<
  GroupColumnDef<AppTableFeatures, TData>,
  "columns"
> & {
  columns?: AppColumnDef<TData, any>[];
};

type AppColumnHelper<TData extends RowData> = {
  accessor: <
    TAccessor extends AccessorFn<TData> | DeepKeys<TData>,
    TValue extends TAccessor extends AccessorFn<TData, infer TReturn>
      ? TReturn
      : TAccessor extends DeepKeys<TData>
        ? DeepValue<TData, TAccessor>
        : never,
  >(
    accessor: TAccessor,
    column: TAccessor extends AccessorFn<TData>
      ? DisplayColumnDef<AppTableFeatures, TData, TValue>
      : IdentifiedColumnDef<AppTableFeatures, TData, TValue>,
  ) => AppColumnDef<TData, any>;
  columns: <TColumns extends ReadonlyArray<AppColumnDef<TData, any>>>(
    columns: [...TColumns],
  ) => AppColumnDef<TData, any>[] & [...TColumns];
  display: (column: DisplayColumnDef<AppTableFeatures, TData>) => AppColumnDef<TData, any>;
  group: (column: AppGroupColumnDef<TData>) => AppColumnDef<TData, any>;
};

export function createColumnHelper<TData extends RowData>(): AppColumnHelper<TData> {
  return createTanstackColumnHelper<AppTableFeatures, TData>() as unknown as AppColumnHelper<TData>;
}

export type AppColumnDef<TData extends RowData, TValue extends CellData = CellData> = ColumnDef<
  AppTableFeatures,
  TData,
  TValue
>;
export type AppTableOptions<TData extends RowData> = TableOptions<AppTableFeatures, TData>;
export type AppColumn<TData extends RowData, TValue = unknown> = Column<
  AppTableFeatures,
  TData,
  TValue
>;
export type AppCell<TData extends RowData, TValue extends CellData = CellData> = Cell<
  AppTableFeatures,
  TData,
  TValue
>;
export type AppHeader<TData extends RowData, TValue extends CellData = CellData> = Header<
  AppTableFeatures,
  TData,
  TValue
>;
export type AppRow<TData extends RowData> = Row<AppTableFeatures, TData>;
export type AppTable<TData extends RowData> = Table<AppTableFeatures, TData>;
export type AppSortFn<TData extends RowData> = SortFn<AppTableFeatures, TData>;

export type { RowData };
