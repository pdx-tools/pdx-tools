import type { StripGeometry } from "./ledgerGeometry";

/** One save's mark in a row: its value and the game color of the tag held then. */
export type Mark = { value: number; color: string };

/** A row scale: zero-based for countries, fitted for the world, with its reference lines. */
export type Scale = { lo: number; hi: number; refs: number[] };

export type Layout = {
  narrow: boolean;
  /** Nine rows or more: rows take less height so the list still fits. */
  compact: boolean;
  /** Sixteen rows or more: the reference labels repeat on every row. */
  dense: boolean;
  rowHeight: number;
  flag: "compact" | "small";
};

export const muted = "text-gray-600 dark:text-gray-300";
export const faint = "text-gray-500 dark:text-gray-400";
/** The ink of the rules and of the edge on the read strokes. */
export const ink = { light: "#0f172a", dark: "#f1f5f9" };
/** The world total's mark: the app's accent, not a country's color. */
export const accent = { light: "#0284c7", dark: "#38bdf8" };

/** A fixed, comfortable row height: taller for a few countries, smaller for many. */
export function layoutFor(width: number, rows: number, world: boolean): Layout {
  const narrow = width < 600;
  const compact = rows >= 9;
  const dense = rows >= 16;
  const rowHeight = world
    ? narrow
      ? 300
      : 420
    : dense
      ? 44
      : compact
        ? narrow
          ? 54
          : 64
        : narrow
          ? 72
          : 88;
  return { narrow, compact, dense, rowHeight, flag: compact || narrow ? "compact" : "small" };
}

/** The widths of the name, scale label and value columns; the strip takes the rest. */
export function columnsFor(layout: Layout, world: boolean) {
  if (world) return { id: 0, scale: layout.narrow ? 34 : 44, value: layout.narrow ? 88 : 112 };
  return layout.narrow ? { id: 170, scale: 28, value: 46 } : { id: 202, scale: 34, value: 62 };
}

/** The y of a value in a row of a height: zero-based for countries, fitted for the world. */
export function yOf(scale: Scale, height: number, world: boolean) {
  const top = world ? 22 : Math.round(height * 0.12);
  const foot = world ? 18 : 0;
  return (value: number) =>
    top + (1 - (value - scale.lo) / (scale.hi - scale.lo || 1)) * (height - top - foot);
}

/** The x of the middle of a save's stroke, on a pixel's center for one-pixel rules. */
export function centerOf(geometry: StripGeometry, i: number) {
  return Math.floor(geometry.x[i] + geometry.bar / 2) + 0.5;
}
