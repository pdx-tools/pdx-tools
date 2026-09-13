import { useCallback } from "react";
import type { RowData } from "@/lib/tanstack-table";
import { Eu5DataTable } from "./Eu5DataTable";
import type { Eu5DataTableProps } from "./Eu5DataTable";
import { useEu5MapHoverSource } from "../useEu5MapHoverTarget";
import type { Eu5MapHoverTarget } from "../useEu5MapHoverTarget";

type Eu5MapDataTableProps<TData extends RowData> = Eu5DataTableProps<TData> & {
  getRowHoverTarget?: (row: TData) => Eu5MapHoverTarget | null | undefined;
};

export function Eu5MapDataTable<TData extends RowData>({
  getRowHoverTarget,
  onRowHoverChange,
  onRowFocusChange,
  ...props
}: Eu5MapDataTableProps<TData>) {
  const hoverSource = useEu5MapHoverSource();

  const handleRowHoverChange = useCallback(
    (row: TData | null) => {
      onRowHoverChange?.(row);
      hoverSource.highlightTarget(row && getRowHoverTarget ? getRowHoverTarget(row) : null);
    },
    [getRowHoverTarget, hoverSource, onRowHoverChange],
  );

  const handleRowFocusChange = useCallback(
    (row: TData | null) => {
      onRowFocusChange?.(row);
      hoverSource.highlightTarget(row && getRowHoverTarget ? getRowHoverTarget(row) : null);
    },
    [getRowHoverTarget, hoverSource, onRowFocusChange],
  );

  return (
    <Eu5DataTable
      {...props}
      onRowHoverChange={getRowHoverTarget || onRowHoverChange ? handleRowHoverChange : undefined}
      onRowFocusChange={getRowHoverTarget || onRowFocusChange ? handleRowFocusChange : undefined}
    />
  );
}
