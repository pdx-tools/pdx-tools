/**
 * Pick the variant by *when* the ring should appear, not by what the element is.
 *
 * The ring is a 2px outline. An outline stays in high contrast mode, and the
 * gap shows the ground under the control.
 */

/** Keyboard focus only. The default — use this unless a field stays focused. */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-game-accent-focus";

/** Keyboard focus on a full-bleed row; the ring is drawn inside the box. */
export const focusRingInset =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-game-accent-focus";

/** Any focus, pointer included. Text inputs and select triggers. */
export const focusRingAlways =
  "focus:outline-2 focus:outline-offset-1 focus:outline-game-accent-focus";

/** Focus anywhere inside a composite field; the ring belongs to the wrapper. */
export const focusRingWithin =
  "focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-game-accent-focus";

/** For controls too narrow to carry a ring — the strip itself lights up. */
export const focusBar = "focus-visible:outline-hidden focus-visible:bg-game-accent-focus";
