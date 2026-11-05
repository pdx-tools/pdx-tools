/**
 * The sizes of the column on a phone, where it is a sheet over the map. Each
 * size leaves the map usable: "sheet" keeps room for the map above the timeline
 * bar, and "map" keeps the head and the mode's caption in view.
 */
export const SHEET_SNAPS = ["map", "half", "sheet"] as const;
export type SheetSnap = (typeof SHEET_SNAPS)[number];

export const SHEET_LABELS: Record<SheetSnap, string> = {
  map: "Mostly map",
  half: "Half",
  sheet: "Mostly sheet",
};

/**
 * The first size, as a share of the frame. At 390x844 the map keeps more than 330px,
 * and the timeline's one row leaves most of that free.
 */
const HALF_SHARE = 0.6;
/** The height of map that stays in view at the largest size, in px */
const MAP_KEPT = 200;
/** The speed of a flick, in px for each ms. A slower release goes to the nearest size. */
const FLICK_SPEED = 0.4;

/** The height of the sheet at a size, for a frame of this height */
export function sheetHeight(snap: SheetSnap, frame: number): number {
  const sheet = Math.max(0, Math.min(frame * 0.76, frame - MAP_KEPT));
  const half = Math.min(frame * HALF_SHARE, sheet);
  if (snap === "sheet") return Math.round(sheet);
  if (snap === "half") return Math.round(half);
  return Math.round(Math.min(frame * 0.3, half));
}

/**
 * The size that a drag ends on. `speed` is positive when the sheet goes up. A
 * flick goes to the next size in its direction, and a slow release to the nearest.
 */
export function settleSnap(height: number, speed: number, frame: number): SheetSnap {
  const sizes = SHEET_SNAPS.map((snap) => ({ snap, height: sheetHeight(snap, frame) }));
  if (Math.abs(speed) >= FLICK_SPEED) {
    const ahead =
      speed > 0
        ? sizes.find((x) => x.height > height)
        : [...sizes].reverse().find((x) => x.height < height);
    if (ahead) return ahead.snap;
  }
  return sizes.reduce((best, x) =>
    Math.abs(x.height - height) < Math.abs(best.height - height) ? x : best,
  ).snap;
}

/** The next size up or down. It stops at the two ends. */
export function stepSnap(snap: SheetSnap, step: 1 | -1): SheetSnap {
  const index = SHEET_SNAPS.indexOf(snap) + step;
  return SHEET_SNAPS[Math.max(0, Math.min(SHEET_SNAPS.length - 1, index))];
}

/** The size after a tap: the next one up, and from the largest back to the smallest */
export function cycleSnap(snap: SheetSnap): SheetSnap {
  return SHEET_SNAPS[(SHEET_SNAPS.indexOf(snap) + 1) % SHEET_SNAPS.length];
}
