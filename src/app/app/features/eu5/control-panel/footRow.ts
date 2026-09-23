/**
 * The three rows at the foot of the control panel (View, Share, Export) share
 * one grammar: a 36px row, a mono micro-label in a fixed column, then the
 * row's controls. The classes live here so the rows cannot drift apart.
 */

/** A foot row: `row-cozy` height, panel inset, hairline above. */
export const footRow = "flex h-9 shrink-0 items-center gap-2 border-t border-game-line px-3.5";

/** The label column. Fixed width so the three rows' content lines up. */
export const footLabel =
  "w-12 shrink-0 font-mono text-[9.5px] font-medium tracking-[0.2em] text-game-ink-500 uppercase";
