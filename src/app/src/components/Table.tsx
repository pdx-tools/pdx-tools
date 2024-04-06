import * as React from "react";
import { Column, SortDirection } from "@tanstack/react-table";
import { cx } from "class-variance-authority";
import { Button } from "./Button";
import {
  ChevronDownIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/20/solid";

const TableImpl = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(function Table({ className, ...props }, ref) {
  return (
    <div className="w-full overflow-auto">
      <table
        ref={ref}
        className={cx("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
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
        "border-0 border-b border-solid dark:border-gray-600 transition-colors hover:bg-gray-200/50 data-[state=selected]:bg-gray-200 dark:hover:bg-gray-600/50 data-[state=selected]:bg-gray-600/50",
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
  return (
    <th
      ref={ref}
      className={cx(
        "min-h-12 px-4 text-left align-middle font-medium text-gray-800 dark:text-slate-300 [&:has([role=checkbox])]:pr-0",
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
  return (
    <td
      ref={ref}
      className={cx(
        "p-4 [&:has([role=checkbox])]:pr-0",
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
  extends React.HTMLAttributes<HTMLButtonElement> {
  column: Column<TData, TValue>;
  title: string;
}

function ColumnHeaderInner<TData, TValue>(
  { column, title, className, ...rest }: ColumnHeaderProps<TData, TValue>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  if (!column.getCanSort()) {
    throw new Error("eeeK");
    // return <div className={cx(className)} ref={ref}>{title}</div>;
  }

  return (
    <Button
      {...rest}
      className={cx(
        "h-full w-full justify-between gap-2 font-semibold",
        className,
      )}
      variant="ghost"
      shape="none"
      ref={ref}
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      <span>{title}</span>
      <SortIcon sorted={column.getIsSorted()} />
    </Button>
  );
}

const SortIcon = ({ sorted }: { sorted: false | SortDirection }) => {
  switch (sorted) {
    case false:
      return <ChevronUpDownIcon className="h-3 w-3" />;
    case "asc":
      return <ChevronUpIcon className="h-3 w-3" />;
    case "desc":
      return <ChevronDownIcon className="h-3 w-3" />;
  }
};

const ColumnHeader = React.forwardRef(ColumnHeaderInner) as <TData, TValue>(
  props: ColumnHeaderProps<TData, TValue> & {
    ref?: React.ForwardedRef<HTMLButtonElement>;
  },
) => ReturnType<typeof ColumnHeaderInner>;

Table.ColumnHeader = ColumnHeader;
