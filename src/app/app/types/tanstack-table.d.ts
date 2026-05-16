import type { RowData } from "@tanstack/react-table";

export type Eu5DataTableColumnVariant = "default" | "pin" | "num" | "vis" | "end";

export type Eu5DataTableColumnMeta = {
  variant?: Eu5DataTableColumnVariant;
  width?: number | string;
  minWidth?: number | string;
  align?: "left" | "right" | "center";
  headerLabel?: string;
};

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    eu5?: Eu5DataTableColumnMeta;
    className?: string | ((value: TValue) => string);
    headClassName?: string;
  }
}
