import React from "react";
import { cx } from "class-variance-authority";
import ChevronRightIcon from "@heroicons/react/20/solid/ChevronRightIcon";
import XMarkIcon from "@heroicons/react/20/solid/XMarkIcon";
import ChevronDownIcon from "@heroicons/react/16/solid/ChevronDownIcon";
import ChevronUpIcon from "@heroicons/react/16/solid/ChevronUpIcon";
import { focusRing, focusRingInset } from "@/components/game/focusRing";

/**
 * The parts that every level of the stack is built from. They read only the
 * `--game-*` tokens, so any game theme can use them.
 */

const microLabel =
  "font-game-num text-[10px] leading-none font-medium tracking-[0.14em] text-game-ink-500 uppercase";

/** A color plate. A light rim keeps very dark game colors visible. */
export function Swatch({ color, size = 12 }: { color: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[2px]"
      style={{
        width: size,
        height: size,
        background: color ?? "transparent",
        boxShadow: color ? "inset 0 0 0 1px rgba(255,255,255,0.24)" : undefined,
      }}
    />
  );
}

/** A bounded ratio in [0, 100], drawn on the stat rail's track */
export function Meter({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="relative inline-block h-1 w-[52px] overflow-hidden rounded-[1px] bg-game-panel-2 ring-1 ring-game-line ring-inset"
      >
        <span
          className="absolute inset-y-0 left-0 bg-game-ink-500"
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="tabular-nums">{label ?? `${Math.round(value)}%`}</span>
    </span>
  );
}

export type Crumb = { key: string; label: string };

/**
 * Where the reader is. The root names the mode (or closes a level that is
 * not part of a mode); a long path collapses its middle.
 */
export function StackCrumbs({
  root,
  onRoot,
  rootIsClose,
  crumbs,
  here,
  onPop,
  action,
}: {
  root: string;
  onRoot: () => void;
  rootIsClose?: boolean;
  /** The levels above the open one, outermost first */
  crumbs: Crumb[];
  here: string;
  /** Go back to the level at this index of `crumbs` */
  onPop: (index: number) => void;
  action?: React.ReactNode;
}) {
  const shown: (Crumb & { index: number })[] = crumbs.map((x, index) => ({ ...x, index }));
  const collapsed = shown.length > 2;
  const visible = collapsed ? [shown[0], shown[shown.length - 1]] : shown;
  const crumbButton = cx(
    "h-6 max-w-[130px] shrink-0 truncate rounded-[2px] px-1.5 text-[12px] text-game-ink-500 hover:bg-game-panel-hover hover:text-game-ink-100",
    focusRing,
  );
  const sep = <ChevronRightIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-game-ink-700" />;

  return (
    <nav
      aria-label="Where you are"
      className="flex h-8 shrink-0 items-center gap-0.5 overflow-hidden border-y border-game-line px-2 whitespace-nowrap"
    >
      {rootIsClose ? (
        <button
          type="button"
          className={cx(crumbButton, "grid w-6 place-items-center px-0")}
          aria-label={`Close ${root}`}
          onClick={onRoot}
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button type="button" className={crumbButton} onClick={onRoot}>
          {root}
        </button>
      )}
      {visible.map((crumb, i) => (
        <React.Fragment key={crumb.key}>
          {sep}
          {collapsed && i === 1 ? (
            <>
              <span className="shrink-0 px-0.5 text-[12px] text-game-ink-500" aria-hidden>
                …
              </span>
              {sep}
            </>
          ) : null}
          <button type="button" className={crumbButton} onClick={() => onPop(crumb.index)}>
            {crumb.label}
          </button>
        </React.Fragment>
      ))}
      {sep}
      <span aria-current="page" className="min-w-0 truncate px-1.5 text-[12px] text-game-ink-100">
        {here}
      </span>
      {action ? <span className="ml-auto shrink-0">{action}</span> : null}
    </nav>
  );
}

/** The identity of a level: its plate, its name, and its tag */
export function LevelTitle({
  swatch,
  title,
  tag,
  aside,
}: {
  swatch?: string | null;
  title: React.ReactNode;
  tag?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-game-line px-3.5 py-3.5">
      {swatch !== undefined ? <Swatch color={swatch} size={16} /> : null}
      <h2 className="min-w-0 flex-1 text-[17px] leading-tight font-semibold tracking-[-0.01em] text-balance">
        {title}
      </h2>
      {tag ? <span className="font-game-num text-[10px] text-game-ink-500">{tag}</span> : null}
      {aside}
    </div>
  );
}

/** A section band inside a level, with optional column labels on the right */
export function Band({ label, columns }: { label: string; columns?: string }) {
  return (
    <div className="flex h-7 items-center justify-between gap-2 border-b border-game-line bg-game-panel-2 px-3.5">
      <span className={microLabel}>{label}</span>
      {columns ? <span className={microLabel}>{columns}</span> : null}
    </div>
  );
}

/** A quiet line that explains what the reader sees */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-game-line px-3.5 py-2 text-[11.5px] leading-snug text-game-ink-500">
      {children}
    </p>
  );
}

/** Facts about one entity: labels left, values right */
export function Facts({ children }: { children: React.ReactNode }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-[5px] border-b border-game-line px-3.5 py-2.5 text-[12px]">
      {children}
    </dl>
  );
}

export function Fact({
  label,
  children,
  text,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  /** The value is words, not a number */
  text?: boolean;
}) {
  return (
    <>
      <dt className="text-game-ink-500">{label}</dt>
      <dd
        className={cx(
          "m-0 min-w-0 text-game-ink-100",
          text ? "font-game-ui" : "font-game-num tabular-nums",
        )}
      >
        {children}
      </dd>
    </>
  );
}

export type RowProps = {
  swatch?: string | null;
  name: React.ReactNode;
  tag?: string;
  sub?: React.ReactNode;
  value?: React.ReactNode;
  dim?: React.ReactNode;
  /** Opens a level. Without it the row is a plain line. */
  onOpen?: () => void;
  hot?: boolean;
  onHover?: (hovering: boolean) => void;
  /** The row opens a wide level */
  wide?: boolean;
};

/**
 * One line of a list. A row that opens a level is a button; the map lights
 * its land while the pointer is over it.
 */
export function Row({ swatch, name, tag, sub, value, dim, onOpen, hot, onHover, wide }: RowProps) {
  const content = (
    <>
      {swatch !== undefined ? <Swatch color={swatch} /> : <span />}
      <span className="min-w-0 text-[12.5px] text-game-ink-100">
        <span className="block truncate">
          {name}
          {tag ? (
            <span
              className={cx(
                "ml-1.5 font-game-num text-[10px] tracking-[0.04em]",
                wide ? "text-game-accent-300" : "text-game-ink-500",
              )}
            >
              {tag}
            </span>
          ) : null}
        </span>
        {sub ? (
          <span className="block text-[11px] leading-snug text-game-ink-500">{sub}</span>
        ) : null}
      </span>
      <span className="min-w-[30px] text-right font-game-num text-[12px] text-game-ink-100 tabular-nums">
        {value}
      </span>
      <span className="min-w-[36px] text-right font-game-num text-[12px] text-game-ink-500 tabular-nums">
        {dim}
      </span>
      {onOpen ? (
        <ChevronRightIcon
          aria-hidden
          className="h-3.5 w-3.5 text-game-ink-700 group-hover:text-game-ink-300"
        />
      ) : (
        <span />
      )}
    </>
  );

  const className = cx(
    "group grid min-h-[30px] w-full grid-cols-[14px_minmax(0,1fr)_auto_auto_14px] items-center gap-2.5 border-b border-game-line px-3.5 py-1 text-left",
    hot && "bg-game-panel-hover",
  );
  const hover = onHover
    ? { onPointerEnter: () => onHover(true), onPointerLeave: () => onHover(false) }
    : {};

  if (!onOpen) {
    return (
      <div className={className} {...hover}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cx(className, "cursor-pointer hover:bg-game-panel-hover", focusRingInset)}
      onClick={onOpen}
      onFocus={onHover ? () => onHover(true) : undefined}
      onBlur={onHover ? () => onHover(false) : undefined}
      {...hover}
    >
      {content}
    </button>
  );
}

export type Column<T> = {
  key: string;
  label: string;
  /** Words align left; numbers align right */
  text?: boolean;
  render: (row: T) => React.ReactNode;
  sort?: (row: T) => number | string;
};

/**
 * The table of a wide level. Rows open their entity and light its land, as
 * list rows do. A click on a sortable header sorts by it.
 */
export function LevelTable<T>({
  columns,
  rows,
  rowKey,
  hoverKey = rowKey,
  onOpen,
  hotKey,
  onHover,
  label,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** The key that lights the row; several rows can share one */
  hoverKey?: (row: T) => string;
  onOpen?: (row: T) => void;
  hotKey?: string | null;
  onHover?: (row: T | null) => void;
  label: string;
}) {
  const [sort, setSort] = React.useState<{ key: string; desc: boolean } | null>(null);
  const sorted = React.useMemo(() => {
    const column = sort && columns.find((x) => x.key === sort.key);
    if (!sort || !column?.sort) {
      return rows;
    }
    const by = column.sort;
    return [...rows].sort((a, b) => {
      const x = by(a);
      const y = by(b);
      const cmp =
        typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -cmp : cmp;
    });
  }, [rows, columns, sort]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]" aria-label={label}>
        <thead>
          <tr>
            {columns.map((column, i) => {
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
                  className={cx(
                    "sticky top-0 z-[1] h-7 border-b border-game-line bg-game-panel-2 px-2.5 whitespace-nowrap",
                    i === 0 && "pl-3.5",
                    column.text ? "text-left" : "text-right",
                  )}
                >
                  {column.sort ? (
                    <button
                      type="button"
                      className={cx(
                        microLabel,
                        "inline-flex cursor-pointer items-center gap-0.5 rounded-[2px] hover:text-game-ink-100",
                        active && "text-game-ink-100",
                        focusRing,
                      )}
                      onClick={() =>
                        setSort((x) =>
                          x?.key === column.key
                            ? { key: column.key, desc: !x.desc }
                            : { key: column.key, desc: !column.text },
                        )
                      }
                    >
                      {column.label}
                      {active ? (
                        sort.desc ? (
                          <ChevronDownIcon aria-hidden className="h-3 w-3" />
                        ) : (
                          <ChevronUpIcon aria-hidden className="h-3 w-3" />
                        )
                      ) : null}
                    </button>
                  ) : (
                    <span className={microLabel}>{column.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                tabIndex={onOpen ? 0 : undefined}
                className={cx(
                  onOpen && "cursor-pointer hover:bg-game-panel-hover",
                  hotKey === hoverKey(row) && "bg-game-panel-hover",
                  focusRingInset,
                )}
                onClick={onOpen ? () => onOpen(row) : undefined}
                onKeyDown={
                  onOpen
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(row);
                        }
                      }
                    : undefined
                }
                onPointerEnter={onHover ? () => onHover(row) : undefined}
                onPointerLeave={onHover ? () => onHover(null) : undefined}
              >
                {columns.map((column, i) => (
                  <td
                    key={column.key}
                    className={cx(
                      "h-[30px] border-b border-game-line px-2.5 whitespace-nowrap",
                      i === 0 && "pl-3.5",
                      column.text
                        ? "text-left font-game-ui text-game-ink-300"
                        : "text-right font-game-num tabular-nums",
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Filter chips: each one turns a kind of record on or off */
export function KindChips<K extends string>({
  kinds,
  on,
  counts,
  onToggle,
  label,
}: {
  kinds: { key: K; label: string }[];
  on: ReadonlySet<K>;
  counts: Record<K, number>;
  onToggle: (key: K) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap gap-1 border-b border-game-line px-3.5 py-2.5"
    >
      {kinds.map((kind) => {
        const pressed = on.has(kind.key);
        return (
          <button
            key={kind.key}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggle(kind.key)}
            className={cx(
              "inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-[2px] border px-2 text-[11.5px]",
              pressed
                ? "border-game-accent-line bg-game-accent-soft text-game-accent-100"
                : "border-game-line bg-game-panel text-game-ink-500 hover:border-game-line-strong hover:text-game-ink-100",
              focusRing,
            )}
          >
            {kind.label}
            <span className="font-game-num text-[10px] tabular-nums opacity-80">
              {counts[kind.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { microLabel };
