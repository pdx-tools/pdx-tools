import type { RowData, TableFeatures } from "@tanstack/react-table";

export type Eu5DataTableColumnVariant = "default" | "pin" | "num" | "vis" | "end";

export type Eu5DataTableColumnMeta = {
  variant?: Eu5DataTableColumnVariant;
  width?: number | string;
  minWidth?: number | string;
  align?: "left" | "right" | "center";
  headerLabel?: string;
  /**
   * The full value that a compact cell shows on hover and on focus. A numeric
   * column has it by default, as `formatExact` of the cell's number. A column
   * that holds a ratio or that has its own form gives this function.
   */
  exact?: (value: number) => string | undefined;
};

declare module "@tanstack/react-table" {
  interface ColumnMeta<TFeatures extends TableFeatures, TData extends RowData, TValue> {
    eu5?: Eu5DataTableColumnMeta;
    className?: string | ((value: TValue) => string);
    headClassName?: string;
  }
}
