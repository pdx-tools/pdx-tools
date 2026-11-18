import { cx } from "class-variance-authority";
import { sectionLabel } from "@/components/game/SectionTitle";

/**
 * The three rows at the foot of the control panel (View, Share, Export) share
 * one grammar: a 36px row, a section label in a fixed column, then the
 * row's controls. The classes live here so the rows cannot drift apart.
 */

/** A foot row: `row-cozy` height, panel inset, hairline above. */
export const footRow = "flex h-9 shrink-0 items-center gap-2 border-t border-game-line px-3.5";

/** The label column. Fixed width so the three rows' content lines up. */
export const footLabel = cx("w-12 shrink-0", sectionLabel);
