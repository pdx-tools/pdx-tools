import { cx } from "class-variance-authority";
import { DataTable } from "@/components/DataTable";
import styles from "./Eu5DataTable.module.css";

type Eu5DataTableProps<TData extends object & Partial<{ rowSpan: number }>> = Parameters<
  typeof DataTable<TData>
>[0];

export function Eu5DataTable<TData extends object & Partial<{ rowSpan: number }>>({
  className,
  ...props
}: Eu5DataTableProps<TData>) {
  return <DataTable className={cx(styles.root, className)} {...props} />;
}
