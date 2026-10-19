import React from "react";
import { cx } from "class-variance-authority";

export type LevelWidth = "narrow" | "wide";

/**
 * One Stack: the map and one column beside it that goes deeper, never wider
 * than its level asks. A wide level (a table) widens the column and the map
 * narrows but stays live. Expanded, the level takes the frame and the map
 * becomes an inset that still lights on hover.
 *
 * The map node keeps its place in the tree in every state, because it holds
 * the canvas; only its classes change.
 */
export function StackLayout({
  width,
  expanded,
  column,
  map,
}: {
  width: LevelWidth;
  expanded: boolean;
  column: React.ReactNode;
  map: React.ReactNode;
}) {
  const full = width === "wide" && expanded;
  return (
    <div
      className={cx(
        "absolute inset-0 flex flex-col-reverse overflow-hidden bg-game-page text-game-ink-100 md:flex-row",
        // On a phone the map comes first and the column follows under it.
        "max-md:overflow-y-auto",
      )}
    >
      <aside
        className={cx(
          "relative z-10 flex min-h-0 shrink-0 flex-col border-game-line-strong bg-game-panel",
          "max-md:h-[64vh] max-md:border-t",
          "motion-reduce:transition-none md:border-r md:transition-[width] md:duration-200 md:ease-[cubic-bezier(0.22,1,0.36,1)]",
          full
            ? "md:w-full md:border-r-0"
            : width === "wide"
              ? "md:w-[min(720px,62%)]"
              : "md:w-[340px]",
        )}
      >
        {column}
      </aside>
      <div
        className={cx(
          "bg-[rgb(28,39,51)]",
          full
            ? "absolute right-3 bottom-12 z-20 h-[170px] w-[340px] overflow-hidden rounded-[var(--radius-panel)] border border-game-line-strong shadow-[0_20px_25px_-5px_rgb(0_0_0/0.45)] max-md:hidden"
            : "relative min-w-0 overflow-hidden max-md:h-[50vh] max-md:min-h-[300px] max-md:shrink-0 md:flex-1",
        )}
      >
        {map}
      </div>
    </div>
  );
}

/** The fixed top of the column: the save, then the mode switch */
export function StackHead({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0">{children}</div>;
}

/** The scrolling body of the column, which holds the open level */
export const StackBody = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function StackBody({ children }, ref) {
    return (
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
    );
  },
);
