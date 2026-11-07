import type { RowData, TableFeatures } from "@tanstack/react-table";
import type { DefinedTermKey } from "@/features/eu5/components/EntityName";

export type Eu5DataTableColumnVariant = "default" | "pin" | "num" | "vis" | "end";

export type Eu5DataTableColumnMeta = {
  variant?: Eu5DataTableColumnVariant;
  width?: number | string;
  minWidth?: number | string;
  align?: "left" | "right" | "center";
  headerLabel?: string;
  /** A term that this tool defines. The header explains it on hover and on focus. */
  term?: DefinedTermKey;
  /**
   * The full value that a cell shows on hover and on focus. A numeric column has
   * it by default, as an amount. A column that holds a ratio or that has its own
   * form gives this function.
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
