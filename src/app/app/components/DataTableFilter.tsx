import { useId, useMemo, useState } from "react";
import ChevronDownIcon from "@heroicons/react/20/solid/ChevronDownIcon";
import { cx } from "class-variance-authority";
import { filterFn_inNumberRange } from "@tanstack/react-table";
import { filterFn_checklist } from "@/lib/tanstack-table";
import type { AppColumn, ChecklistFilter, RowData } from "@/lib/tanstack-table";
import { formatInt } from "@/lib/format";
import { Button } from "./Button";
import { Input } from "./Input";
import { Popover } from "./Popover";

/** The header control follows the column's filter function, so the two always agree. */
export function DataTableFilter<TData extends RowData>({ column }: { column: AppColumn<TData> }) {
  const filterFn: unknown = column.getFilterFn();
  if (filterFn === filterFn_checklist) {
    return <ValuesFilter column={column} />;
  } else if (filterFn === filterFn_inNumberRange) {
    return <RangeFilter column={column} />;
  } else {
    return <TextFilter column={column} />;
  }
}

function TextFilter<TData extends RowData>({ column }: { column: AppColumn<TData> }) {
  const columnFilterValue = column.getFilterValue();
  return (
    <Input
      type="text"
      value={`${columnFilterValue ?? ""}`}
      onChange={(value) => column.setFilterValue(value.currentTarget.value)}
      placeholder={`Search...`}
      className="pl-1"
    />
  );
}

function FilterTrigger({ label, active }: { label: string; active: boolean }) {
  return (
    <Popover.Trigger asChild>
      <Button
        shape="none"
        className={cx(
          "h-7 w-full min-w-20 justify-between gap-1 rounded-md px-2 text-xs font-normal",
          active && "border-sky-600 text-sky-800 dark:border-sky-400 dark:text-sky-200",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </Popover.Trigger>
  );
}

const panelClassName =
  "rounded-md border bg-white p-2 text-sm shadow-md dark:border-gray-600 dark:bg-slate-700";

function valueLabel(value: unknown) {
  return value === null || value === undefined || value === "" ? "None" : String(value);
}

function compareValues(a: unknown, b: unknown) {
  return valueLabel(a).localeCompare(valueLabel(b));
}

function isShown(filter: ChecklistFilter | undefined, value: unknown) {
  return filter === undefined || filter.values.includes(value) === (filter.mode === "only");
}

/** Lists the values of the rows and the values in the filter, sorted. */
function checklistValues(facets: Map<unknown, number>, ...lists: unknown[][]) {
  return [...new Set([...facets.keys(), ...lists.flat()])].sort(compareValues);
}

/** Shows a checkbox for each distinct value. A cleared checkbox hides its rows. */
function ValuesFilter<TData extends RowData>({ column }: { column: AppColumn<TData> }) {
  const [search, setSearch] = useState("");
  const facets = column.getFacetedUniqueValues();
  const filter = column.getFilterValue() as ChecklistFilter | undefined;

  const values = useMemo(() => checklistValues(facets, filter?.values ?? []), [facets, filter]);
  const shown = values.filter((value) => isShown(filter, value));
  const label =
    filter === undefined
      ? "All"
      : shown.length === 1
        ? valueLabel(shown[0])
        : `${shown.length} of ${values.length}`;

  return (
    <Popover>
      <FilterTrigger label={label} active={filter !== undefined} />
      <Popover.Content align="start" className={cx(panelClassName, "flex w-64 flex-col gap-2")}>
        <ValuesList column={column} search={search} setSearch={setSearch} />
      </Popover.Content>
    </Popover>
  );
}

function ValuesList<TData extends RowData>({
  column,
  search,
  setSearch,
}: {
  column: AppColumn<TData>;
  search: string;
  setSearch: (search: string) => void;
}) {
  const facets = column.getFacetedUniqueValues();
  const filter = column.getFilterValue() as ChecklistFilter | undefined;
  // A value in the filter that no current row has stays in the list until the
  // list closes, so a click on its checkbox does not remove it from the list.
  const [listedAtOpen] = useState(() => filter?.values ?? []);

  const values = useMemo(
    () => checklistValues(facets, listedAtOpen, filter?.values ?? []),
    [facets, listedAtOpen, filter],
  );
  const query = search.trim().toLowerCase();
  const matches = query
    ? values.filter((value) => valueLabel(value).toLowerCase().includes(query))
    : values;

  const setShown = (subset: unknown[], visible: boolean) => {
    const mode = filter?.mode ?? "except";
    const listed = filter?.values ?? [];
    // An "only" filter lists the shown values. An "except" filter lists the hidden values.
    const next =
      (mode === "only") === visible
        ? [...listed, ...subset.filter((value) => !listed.includes(value))]
        : listed.filter((value) => !subset.includes(value));
    column.setFilterValue({ mode, values: next } satisfies ChecklistFilter);
  };
  const toggle = (value: unknown, visible: boolean) => setShown([value], visible);
  // Without a search, the two buttons apply to all values, including values
  // that other filters remove and new values.
  const showMatches = () => (query ? setShown(matches, true) : column.setFilterValue(undefined));
  const hideMatches = () =>
    query
      ? setShown(matches, false)
      : column.setFilterValue({ mode: "only", values: [] } satisfies ChecklistFilter);
  const showOnly = (value: unknown) =>
    column.setFilterValue({ mode: "only", values: [value] } satisfies ChecklistFilter);

  return (
    <>
      {values.length > 8 || search !== "" ? (
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search..."
          aria-label="Search values"
          className="px-2 py-1"
        />
      ) : null}
      <div className="flex justify-between">
        <Button variant="ghost" shape="none" className="text-xs underline" onClick={showMatches}>
          {query ? "Show matches" : "Show all"}
        </Button>
        <Button variant="ghost" shape="none" className="text-xs underline" onClick={hideMatches}>
          {query ? "Hide matches" : "Hide all"}
        </Button>
      </div>
      <ul className="flex max-h-72 flex-col overflow-y-auto">
        {matches.map((value) => (
          <li
            key={valueLabel(value)}
            className="group flex items-center gap-1 rounded hover:bg-gray-200/50 dark:hover:bg-gray-600/50"
          >
            <label className="flex min-w-0 grow cursor-pointer items-center gap-2 px-1 py-0.5">
              <input
                type="checkbox"
                className="accent-sky-600"
                checked={isShown(filter, value)}
                onChange={(e) => toggle(value, e.currentTarget.checked)}
              />
              <span className="grow truncate">{valueLabel(value)}</span>
              <span className="text-gray-500 tabular-nums dark:text-gray-400">
                {facets.get(value) ?? 0}
              </span>
            </label>
            <Button
              variant="ghost"
              shape="none"
              className="px-1 text-xs underline opacity-0 group-hover:opacity-100 focus-visible:opacity-100 any-pointer-coarse:opacity-100"
              aria-label={`Show only ${valueLabel(value)}`}
              onClick={() => showOnly(value)}
            >
              Only
            </Button>
          </li>
        ))}
        {matches.length === 0 ? (
          <li className="px-1 py-0.5 text-gray-500 dark:text-gray-400">No values match.</li>
        ) : null}
      </ul>
    </>
  );
}

type Range = [number | undefined, number | undefined];

// Shows a bound as the player typed it, decimals included.
const boundFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });

function rangeLabel(min: number | undefined, max: number | undefined) {
  if (min !== undefined && max !== undefined) {
    // The filter swaps crossed bounds, so the label does too.
    const [low, high] = min <= max ? [min, max] : [max, min];
    return `${boundFormat.format(low)}–${boundFormat.format(high)}`;
  } else if (min !== undefined) {
    return `≥ ${boundFormat.format(min)}`;
  } else if (max !== undefined) {
    return `≤ ${boundFormat.format(max)}`;
  } else {
    return "Any";
  }
}

/** Keeps the rows whose value is between a minimum and a maximum. */
function RangeFilter<TData extends RowData>({ column }: { column: AppColumn<TData> }) {
  const minId = useId();
  const maxId = useId();
  const [min, max] = (column.getFilterValue() as Range | undefined) ?? [undefined, undefined];
  const [lowest, highest] = column.getFacetedMinMaxValues() ?? [undefined, undefined];

  const parse = (text: string) => (text === "" ? undefined : Number(text));
  const setRange = (next: Range) =>
    column.setFilterValue(next[0] === undefined && next[1] === undefined ? undefined : next);

  return (
    <Popover>
      <FilterTrigger label={rangeLabel(min, max)} active={min !== undefined || max !== undefined} />
      <Popover.Content align="start" className={cx(panelClassName, "flex w-56 flex-col gap-2")}>
        <div className="flex gap-2">
          <label htmlFor={minId} className="flex flex-col gap-1">
            Minimum
            <Input
              id={minId}
              type="number"
              step="any"
              value={min ?? ""}
              placeholder={lowest === undefined ? undefined : formatInt(Math.floor(lowest))}
              onChange={(e) => setRange([parse(e.currentTarget.value), max])}
              className="w-full px-2 py-1"
            />
          </label>
          <label htmlFor={maxId} className="flex flex-col gap-1">
            Maximum
            <Input
              id={maxId}
              type="number"
              step="any"
              value={max ?? ""}
              placeholder={highest === undefined ? undefined : formatInt(Math.ceil(highest))}
              onChange={(e) => setRange([min, parse(e.currentTarget.value)])}
              className="w-full px-2 py-1"
            />
          </label>
        </div>
        <Button
          variant="ghost"
          shape="none"
          className="self-start text-xs underline"
          disabled={min === undefined && max === undefined}
          onClick={() => setRange([undefined, undefined])}
        >
          Clear
        </Button>
      </Popover.Content>
    </Popover>
  );
}
