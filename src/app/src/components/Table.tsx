import * as React from "react";
import { Column, SortDirection } from "@tanstack/react-table";
import { cx } from "class-variance-authority";
import { Button, ButtonProps } from "./Button";
import {
  ChevronDownIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/20/solid";
import { check } from "@/lib/isPresent";
import { useContext } from "react";
import { Tooltip } from "./Tooltip";

type TableContextState = { size: "standard" | "compact" | "small" };
const TableContext = React.createContext<TableContextState | undefined>(
  undefined,
);
const useTable = () =>
  check(useContext(TableContext), "table context is undefined");

const TableImpl = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    size?: "standard" | "compact" | "small";
    overflow?: boolean;
  }
>(function Table(
  { className, size = "standard", overflow = true, ...props },
  ref,
) {
  return (
    <TableContext.Provider value={{ size }}>
      <div className={cx("w-full", overflow && "overflow-auto")}>
        <table
          ref={ref}
          className={cx("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    </TableContext.Provider>
  );
});

export const Table = TableImpl as typeof TableImpl & {
  Header: typeof TableHeader;
  Body: typeof TableBody;
  Footer: typeof TableFooter;
  Row: typeof TableRow;
  Head: typeof TableHead;
  Cell: typeof TableCell;
  Caption: typeof TableCaption;
  ColumnHeader: typeof ColumnHeader;
};

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(function TableHeader({ className, ...props }, ref) {
  return (
    <thead
      ref={ref}
      className={cx(
        "[&_tr]:border-0 [&_tr]:border-b [&_tr]:border-solid",
        className,
      )}
      {...props}
    />
  );
});
Table.Header = TableHeader;

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(function TableBody({ className, ...props }, ref) {
  return (
    <tbody
      ref={ref}
      className={cx("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
});
Table.Body = TableBody;

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(function TableFooter({ className, ...props }, ref) {
  return (
    <tfoot ref={ref} className={cx("font-medium", className)} {...props} />
  );
});
Table.Footer = TableFooter;

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(function TableRow({ className, ...props }, ref) {
  return (
    <tr
      ref={ref}
      className={cx(
        "border-0 border-b border-solid transition-colors hover:bg-gray-200/50 data-[state=selected]:bg-gray-200 data-[state=selected]:bg-gray-600/50 dark:border-gray-600 dark:hover:bg-gray-600/50",
        className,
      )}
      {...props}
    />
  );
});
Table.Row = TableRow;

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(function TableHead({ className, ...props }, ref) {
  const table = useTable();
  return (
    <th
      ref={ref}
      className={cx(
        "min-h-12 text-left align-middle font-medium text-gray-800 dark:text-slate-300 [&:has([role=checkbox])]:pr-0",
        table.size === "standard" ? "px-4" : "pl-2",
        className,
      )}
      {...props}
    />
  );
});
Table.Head = TableHead;

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(function TableCell({ className, ...props }, ref) {
  const table = useTable();
  return (
    <td
      ref={ref}
      className={cx(
        "[&:has([role=checkbox])]:pr-0",
        table.size == "standard" ? "p-4" : table.size == "small" ? "px-2" : "",
        className,
        !className?.includes("align-") && "align-middle", // poor man's tailwind merge
      )}
      {...props}
    />
  );
});
Table.Cell = TableCell;

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(function TableCaption({ className, ...props }, ref) {
  return (
    <caption
      ref={ref}
      className={cx("mt-4 text-sm text-gray-600", className)}
      {...props}
    />
  );
});
Table.Caption = TableCaption;

interface ColumnHeaderProps<TData, TValue>
  extends Omit<React.HTMLAttributes<HTMLButtonElement>, "title"> {
  column: Column<TData, TValue>;
  icon?: React.ReactNode;
  title: string;
}

function ColumnHeaderButtonInner<TData, TValue>(
  { column, title, icon, className, ...rest }: ColumnHeaderProps<TData, TValue>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  return (
    <Button
      {...rest}
      className={cx(
        "h-full w-full gap-2 font-semibold",
        className,
        !icon && "justify-between",
      )}
      variant="ghost"
      shape="none"
      ref={ref}
      onClick={() => {
        const sorted = column.getIsSorted();
        if (sorted === "desc") {
          column.clearSorting();
        } else {
          column.toggleSorting(sorted === "asc");
        }
      }}
    >
      {icon}
      <span className={icon ? "sr-only" : ""}>{title}</span>
      <SortIcon sorted={column.getIsSorted()} />
    </Button>
  );
}

const ColumnHeaderButton = React.forwardRef(ColumnHeaderButtonInner) as <
  TData,
  TValue,
>(
  props: ColumnHeaderProps<TData, TValue> & {
    ref?: React.ForwardedRef<HTMLButtonElement>;
  },
) => ReturnType<typeof ColumnHeaderButtonInner>;

function ColumnHeaderInner<TData, TValue>(
  props: ColumnHeaderProps<TData, TValue>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  check(props.column.getCanSort(), "All columns are assumed to be sortable");

  if (props.icon) {
    return (
      <Tooltip>
        <Tooltip.Trigger asChild>
          <ColumnHeaderButton ref={ref} {...props} />
        </Tooltip.Trigger>
        <Tooltip.Content>{props.title}</Tooltip.Content>
      </Tooltip>
    );
  } else {
    return <ColumnHeaderButton ref={ref} {...props} />;
  }
}

const SortIcon = ({ sorted }: { sorted: false | SortDirection }) => {
  switch (sorted) {
    case false:
      return <ChevronUpDownIcon className="h-3 w-3 shrink-0" />;
    case "asc":
      return <ChevronUpIcon className="h-3 w-3 shrink-0" />;
    case "desc":
      return <ChevronDownIcon className="h-3 w-3 shrink-0" />;
  }
};

const ColumnHeader = React.forwardRef(ColumnHeaderInner) as <TData, TValue>(
  props: ColumnHeaderProps<TData, TValue> & {
    ref?: React.ForwardedRef<HTMLButtonElement>;
  },
) => ReturnType<typeof ColumnHeaderInner>;

Table.ColumnHeader = ColumnHeader;
