/**
 * Names set on the land as an atlas sets them: along a realm's long axis,
 * sized by its extent, upright, and the most important name first.
 */

import type { NamePlacement } from "@/wasm/wasm_eu5";

export type WorldPoint = { x: number; y: number };

/** The shape of a realm in world units */
export type RealmShape = {
  center: WorldPoint;
  /** The length along the long axis, and across it */
  major: number;
  minor: number;
  /** The slope of the long axis, in radians */
  angle: number;
};

/** A rectangle of the world in world units, or of the frame in CSS pixels */
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The value at `q` of the way up the values, which this reorders. A partial
 * sort finds it, because a full sort costs more on a large realm.
 */
function quantile(values: Float64Array, q: number): number {
  const k = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * q)));
  let [low, high] = [0, values.length - 1];
  while (low < high) {
    const pivot = values[(low + high) >> 1];
    let [i, j] = [low, high];
    while (i <= j) {
      while (values[i] < pivot) i++;
      while (values[j] > pivot) j--;
      if (i <= j) {
        [values[i], values[j]] = [values[j], values[i]];
        i++;
        j--;
      }
    }
    if (k <= j) high = j;
    else if (k >= i) low = i;
    else break;
  }
  return values[k];
}

/**
 * The shape of a realm from the middles of its locations, given as `[x, y]`
 * pairs. Only the main body counts, and its outer 5% on each side go, so
 * that land overseas does not pull the name into the sea.
 */
export function realmShape(points: Float64Array, worldWidth: number): RealmShape | null {
  if (points.length === 0) return null;
  const main = largestBody(points, worldWidth);

  const middle = bodyMiddle(points, main, worldWidth);
  const count = main.length;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  for (let n = 0; n < count; n++) {
    let x = points[main[n] * 2] - middle;
    x -= Math.round(x / worldWidth) * worldWidth;
    xs[n] = x;
    ys[n] = points[main[n] * 2 + 1];
  }

  const [sortedX, sortedY] = [xs.slice(), ys.slice()];
  const [xLow, xHigh] = [quantile(sortedX, 0.05), quantile(sortedX, 0.95)];
  const [yLow, yHigh] = [quantile(sortedY, 0.05), quantile(sortedY, 0.95)];
  const core = new Uint32Array(count);
  let size = 0;
  for (let n = 0; n < count; n++) {
    if (xs[n] >= xLow && xs[n] <= xHigh && ys[n] >= yLow && ys[n] <= yHigh) core[size++] = n;
  }
  const body = size > 0 ? core.subarray(0, size) : Uint32Array.from(xs.keys());

  let [meanX, meanY] = [0, 0];
  for (const n of body) {
    meanX += xs[n];
    meanY += ys[n];
  }
  meanX /= body.length;
  meanY /= body.length;
  let [xx, yy, xy] = [0, 0, 0];
  for (const n of body) {
    const [dx, dy] = [xs[n] - meanX, ys[n] - meanY];
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const [cosA, sinA] = [Math.cos(angle), Math.sin(angle)];
  let [alongLow, alongHigh, acrossLow, acrossHigh] = [Infinity, -Infinity, Infinity, -Infinity];
  // The name stands on the realm's own land, and not on a sea that the realm surrounds.
  let nearest = body[0];
  let nearestDistance = Infinity;
  for (const n of body) {
    const [dx, dy] = [xs[n] - meanX, ys[n] - meanY];
    const along = dx * cosA + dy * sinA;
    const across = -dx * sinA + dy * cosA;
    alongLow = Math.min(alongLow, along);
    alongHigh = Math.max(alongHigh, along);
    acrossLow = Math.min(acrossLow, across);
    acrossHigh = Math.max(acrossHigh, across);
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = n;
      nearestDistance = distance;
    }
  }
  return {
    center: {
      x: (((xs[nearest] + middle) % worldWidth) + worldWidth) % worldWidth,
      y: ys[nearest],
    },
    // One location has no extent, so it gets the room of one location.
    major: Math.max(alongHigh - alongLow, worldWidth / 1200),
    minor: Math.max(acrossHigh - acrossLow, worldWidth / 2400),
    angle,
  };
}

/**
 * The x that the body is read around. The world wraps, so the body is cut
 * where it has the widest gap of empty columns, and read from the far side
 * of that gap.
 */
function bodyMiddle(points: Float64Array, body: Uint32Array, worldWidth: number): number {
  const cell = worldWidth / BODY_CELLS;
  const filled = new Uint8Array(BODY_CELLS);
  for (const i of body) {
    filled[((Math.floor(points[i * 2] / cell) % BODY_CELLS) + BODY_CELLS) % BODY_CELLS] = 1;
  }
  let [gapStart, gapLength, run] = [-1, 0, 0];
  // Two passes over the columns find a gap that wraps past the last column.
  for (let n = 0; n < BODY_CELLS * 2; n++) {
    run = filled[n % BODY_CELLS] ? 0 : run + 1;
    if (run > gapLength && run <= BODY_CELLS) [gapStart, gapLength] = [n - run + 1, run];
  }
  // A body around the whole world has no gap, and is read from its first column.
  const cut = gapStart < 0 ? 0 : (gapStart + gapLength / 2) * cell;
  return cut + worldWidth / 2;
}

/** Locations in neighboring cells of a grid this many cells wide are one body of land */
const BODY_CELLS = 90;

/**
 * The indices of the largest group of locations that lie near each other.
 * The grid wraps at the edge of the world, as the map does.
 */
function largestBody(points: Float64Array, worldWidth: number): Uint32Array {
  const count = points.length / 2;
  const cell = worldWidth / BODY_CELLS;
  // The grid has the rows of the realm only, so a small realm has a small grid.
  let [top, bottom] = [Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(points[i * 2 + 1] / cell);
    top = Math.min(top, row);
    bottom = Math.max(bottom, row);
  }
  const rows = bottom - top + 1;
  const cellOf = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const column = ((Math.floor(points[i * 2] / cell) % BODY_CELLS) + BODY_CELLS) % BODY_CELLS;
    cellOf[i] = (Math.floor(points[i * 2 + 1] / cell) - top) * BODY_CELLS + column;
  }
  const counts = new Uint32Array(rows * BODY_CELLS);
  for (const at of cellOf) counts[at] += 1;

  // Each cell with land gets the number of its group. Zero is no group yet.
  const group = new Uint32Array(counts.length);
  const stack = new Int32Array(counts.length);
  let [groups, best, bestSize] = [0, 0, 0];
  for (const start of cellOf) {
    if (group[start] !== 0) continue;
    groups += 1;
    group[start] = groups;
    let size = 0;
    let depth = 0;
    stack[depth++] = start;
    while (depth > 0) {
      const at = stack[--depth];
      size += counts[at];
      const row = Math.floor(at / BODY_CELLS);
      const column = at % BODY_CELLS;
      for (let dy = -1; dy <= 1; dy++) {
        const r = row + dy;
        if (r < 0 || r >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const next = r * BODY_CELLS + ((column + dx + BODY_CELLS) % BODY_CELLS);
          if (counts[next] === 0 || group[next] !== 0) continue;
          group[next] = groups;
          stack[depth++] = next;
        }
      }
    }
    if (size > bestSize) [best, bestSize] = [groups, size];
  }

  const body = new Uint32Array(bestSize);
  let next = 0;
  for (let i = 0; i < count; i++) {
    if (group[cellOf[i]] === best) body[next++] = i;
  }
  return body;
}

export type RealmName = {
  text: string;
  shape: RealmShape;
  placement: NamePlacement;
};

export type PlacedName = {
  text: string;
  /** The middle of the text in frame pixels */
  x: number;
  y: number;
  size: number;
  /** Radians */
  angle: number;
  /** A large realm is set in spaced capitals */
  capitals: boolean;
  /** The realm's place, when the name stands away from it. A line joins the two. */
  anchor?: WorldPoint;
};

/** The width of a text in ems, at a font size of 1 */
export type MeasureText = (text: string, capitals: boolean) => number;

/** Capitals have this much space after each letter, in ems */
export const CAPITAL_SPACING = 0.14;

const MIN_SIZE = 11;
/** Each smaller size that a name tries, as a share of the last */
const SIZE_STEP = 0.8;
const MAX_SIZE = 30;
const CAPITALS_FROM = 18;
/** The share of a realm's long axis that its name can fill */
const AXIS_SHARE = 0.86;
/** A name leans only when its realm is clearly long, and never steeply */
const MAX_LEAN = Math.PI / 5;
const LONG_REALM = 1.5;
/** The space that each name keeps around it, so that two names never touch */
const NAME_GAP = 4;
const FRAME_MARGIN = 4;
/** How far a name with a leader line looks for a place, in pixels */
const FAR_REACH = 80;
/** Half the width of a leader line with its halo, in pixels */
export const LEADER_HALO = 1.25;
/** The size of a name away from its land */
const NOTE_SIZE = 12;
/** The directions to look in, the nearest to reading order first */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
  [0.7, -0.7],
  [-0.7, -0.7],
  [0.7, 0.7],
  [-0.7, 0.7],
];

/**
 * The places that a name that must show tries, the nearest first, and if
 * each needs a line to its land. Only a name with a leader line goes far.
 */
function* noteOffsets(
  width: number,
  height: number,
  leaderLine: boolean,
): Generator<[number, number, boolean]> {
  yield [0, 0, false];
  // Near places keep the text against its land: beside it, or up to two lines away.
  for (const [x, y] of DIRECTIONS) yield [x * width * 0.6, y * height, false];
  for (const [x, y] of DIRECTIONS) if (x === 0) yield [0, y * height * 2, false];
  if (!leaderLine) return;
  for (const reach of [FAR_REACH / 2, FAR_REACH]) {
    for (const [x, y] of DIRECTIONS) yield [x * reach, y * reach, true];
  }
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** A box with room for the halo of a leader line on each side */
const grow = (box: Box): Box => ({
  x0: box.x0 - LEADER_HALO,
  y0: box.y0 - LEADER_HALO,
  x1: box.x1 + LEADER_HALO,
  y1: box.y1 + LEADER_HALO,
});

const touches = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** True if the segment from `a` to `b` crosses the box */
function crosses(a: WorldPoint, b: WorldPoint, box: Box): boolean {
  let [low, high] = [0, 1];
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  for (const [delta, from, min, max] of [
    [dx, a.x, box.x0, box.x1],
    [dy, a.y, box.y0, box.y1],
  ]) {
    if (delta === 0) {
      if (from < min || from > max) return false;
      continue;
    }
    let [t0, t1] = [(min - from) / delta, (max - from) / delta];
    if (t0 > t1) [t0, t1] = [t1, t0];
    low = Math.max(low, t0);
    high = Math.min(high, t1);
    if (low > high) return false;
  }
  return true;
}

function textBox(x: number, y: number, width: number, height: number, angle: number): Box {
  const w = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
  const h = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
  // About a letter between two names on one line, so that they do not read as one.
  const gap = Math.max(NAME_GAP, height * 0.3);
  return {
    x0: x - w / 2 - gap,
    y0: y - h / 2 - NAME_GAP / 2,
    x1: x + w / 2 + gap,
    y1: y + h / 2 + NAME_GAP / 2,
  };
}

/** The boxes of the placed names, by cell of the frame, so that a test reads only its neighbors */
class BoxGrid {
  private static readonly CELL = 64;
  private readonly cells = new Map<number, Box[]>();

  add(box: Box): void {
    this.each(box, (key) => {
      const boxes = this.cells.get(key);
      if (boxes) boxes.push(box);
      else this.cells.set(key, [box]);
    });
  }

  /** True if the segment from `a` to `b` crosses a placed name */
  crosses(a: WorldPoint, b: WorldPoint): boolean {
    const span = {
      x0: Math.min(a.x, b.x),
      y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x),
      y1: Math.max(a.y, b.y),
    };
    let found = false;
    this.each(span, (key) => {
      found ||= this.cells.get(key)?.some((other) => crosses(a, b, other)) ?? false;
    });
    return found;
  }

  touches(box: Box): boolean {
    let found = false;
    this.each(box, (key) => {
      found ||= this.cells.get(key)?.some((other) => touches(box, other)) ?? false;
    });
    return found;
  }

  private each(box: Box, visit: (key: number) => void): void {
    const cell = BoxGrid.CELL;
    for (let row = Math.floor(box.y0 / cell); row <= Math.floor(box.y1 / cell); row++) {
      for (let column = Math.floor(box.x0 / cell); column <= Math.floor(box.x1 / cell); column++) {
        visit(row * 4096 + column);
      }
    }
  }
}

/**
 * Place the names, in their order, for one view of the map. Each name takes
 * the largest size that its realm allows, or none if it does not fit. A name
 * that must show moves near its land when another name or a cover is there.
 *
 * @param view The world rectangle that the frame shows
 * @param frame The size of the frame in CSS pixels
 * @param covers Parts of the frame that a panel covers
 */
export function placeNames(
  names: readonly RealmName[],
  view: Rect,
  worldWidth: number,
  frame: { width: number; height: number },
  covers: readonly Rect[],
  measure: MeasureText,
): PlacedName[] {
  const scaleX = frame.width / view.width;
  const scaleY = frame.height / view.height;
  const covered = covers.map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height }));
  const placed: PlacedName[] = [];
  const boxes = new BoxGrid();
  const inFrame = (box: Box) =>
    box.x0 >= FRAME_MARGIN &&
    box.x1 <= frame.width - FRAME_MARGIN &&
    box.y0 >= FRAME_MARGIN &&
    box.y1 <= frame.height - FRAME_MARGIN;
  const isFree = (box: Box) =>
    inFrame(box) && !covered.some((other) => touches(box, other)) && !boxes.touches(box);

  for (const name of names) {
    const { shape } = name;
    const dx = (((shape.center.x - view.x) % worldWidth) + worldWidth) % worldWidth;
    const land = { x: dx * scaleX, y: (shape.center.y - view.y) * scaleY };
    const point = { x0: land.x, y0: land.y, x1: land.x, y1: land.y };
    // A realm whose middle is out of view or under a panel has no name.
    if (!inFrame(point) || covered.some((other) => touches(point, other))) continue;

    const majorPx = shape.major * scaleX;
    const minorPx = shape.minor * scaleX;
    const long = shape.major / shape.minor >= LONG_REALM && majorPx > 60;
    // A name reads left to right, so a slope folds into the upright half.
    const lean = shape.angle - Math.round(shape.angle / Math.PI) * Math.PI;
    const angle = long ? Math.max(-MAX_LEAN, Math.min(MAX_LEAN, lean)) : 0;
    // The land along the text and across it. A steep realm has less room than its length.
    const [cosT, sinT] = [Math.abs(Math.cos(angle - lean)), Math.abs(Math.sin(angle - lean))];
    const along = Math.min(majorPx / cosT, minorPx / sinT);
    const across = Math.min(minorPx / cosT, majorPx / sinT);
    const room = along * AXIS_SHARE;
    const asCapitals = room / measure(name.text, true);
    const canCapitals = asCapitals >= CAPITALS_FROM && across >= CAPITALS_FROM;
    const fitted = canCapitals
      ? Math.min(asCapitals, Math.max(across * 0.7, CAPITALS_FROM))
      : room / measure(name.text, false);
    let onLand = false;
    // A name that meets another one tries smaller sizes on its land, the smallest last.
    const smaller = (size: number) => (size > MIN_SIZE ? Math.max(MIN_SIZE, size * SIZE_STEP) : 0);
    for (let size = Math.min(MAX_SIZE, fitted); size >= MIN_SIZE; size = smaller(size)) {
      const capitals = canCapitals && size >= CAPITALS_FROM;
      // Title case stays below the size of capitals, so that a larger name is never the lesser one.
      if (!capitals) size = Math.min(size, CAPITALS_FROM - 1);
      const width = measure(name.text, capitals) * size;
      const box = textBox(land.x, land.y, width, size * 1.15, angle);
      if (!isFree(box)) continue;
      boxes.add(box);
      placed.push({ text: name.text, x: land.x, y: land.y, size, angle, capitals });
      onLand = true;
      break;
    }
    if (onLand || name.placement === "onLand") continue;

    // Away from its land a name is a plain note, level and small, so that it does not read as land.
    const noteWidth = measure(name.text, false) * NOTE_SIZE;
    const noteHeight = NOTE_SIZE * 1.15;
    for (const [ox, oy, line] of noteOffsets(
      noteWidth,
      noteHeight,
      name.placement === "leaderLine",
    )) {
      const at = { x: land.x + ox, y: land.y + oy };
      const box = textBox(at.x, at.y, noteWidth, noteHeight, 0);
      // A line goes neither under a panel nor through another name.
      const blocked =
        line &&
        (covered.some((cover) => crosses(land, at, grow(cover))) || boxes.crosses(land, at));
      if (!isFree(box) || blocked) continue;
      boxes.add(box);
      placed.push({
        text: name.text,
        ...at,
        size: NOTE_SIZE,
        angle: 0,
        capitals: false,
        ...(line ? { anchor: land } : {}),
      });
      break;
    }
  }
  return placed;
}
