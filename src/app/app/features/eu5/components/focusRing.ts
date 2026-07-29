/**
 * Pick the variant by *when* the ring should appear, not by what the element is:
 */

/** Keyboard focus only. The default — use this unless a field stays focused. */
export const focusRing =
  "focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-game-accent-focus";

/** Keyboard focus on a full-bleed row; the ring is drawn inside the box. */
export const focusRingInset =
  "focus-visible:outline-hidden focus-visible:inset-ring-1 focus-visible:inset-ring-game-accent-focus";

/** Any focus, pointer included. Text inputs and select triggers. */
export const focusRingAlways = "focus:outline-hidden focus:ring-1 focus:ring-game-accent-focus";

/** Focus anywhere inside a composite field; the ring belongs to the wrapper. */
export const focusRingWithin =
  "focus-within:outline-hidden focus-within:ring-1 focus-within:ring-game-accent-focus";

/** For controls too narrow to carry a ring — the strip itself lights up. */
export const focusBar = "focus-visible:outline-hidden focus-visible:bg-game-accent-focus";
