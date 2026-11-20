/**
 * Names set on the land, as an atlas sets them: along the long axis of a
 * realm, with a size that follows its extent, upright, and the most
 * important name first. The functions are pure, so that tests can check them.
 */

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
 * pairs. The world wraps, so x is read around the realm's own middle. The
 * outer 5% on each side go, so that a far colony does not stretch a name
 * across an ocean.
 */
export function realmShape(points: Float64Array, worldWidth: number): RealmShape | null {
  const count = points.length / 2;
  if (count === 0) return null;
  const turn = (2 * Math.PI) / worldWidth;
  let sin = 0;
  let cos = 0;
  for (let i = 0; i < count; i++) {
    sin += Math.sin(points[i * 2] * turn);
    cos += Math.cos(points[i * 2] * turn);
  }
  const middle = ((Math.atan2(sin, cos) + 2 * Math.PI) % (2 * Math.PI)) / turn;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let x = points[i * 2] - middle;
    if (x > worldWidth / 2) x -= worldWidth;
    if (x < -worldWidth / 2) x += worldWidth;
    xs[i] = x;
    ys[i] = points[i * 2 + 1];
  }

  const main = largestBody(xs, ys, worldWidth);
  const mainXs = new Float64Array(main.length);
  const mainYs = new Float64Array(main.length);
  for (let n = 0; n < main.length; n++) {
    mainXs[n] = xs[main[n]];
    mainYs[n] = ys[main[n]];
  }
  const [xLow, xHigh] = [quantile(mainXs, 0.05), quantile(mainXs, 0.95)];
  const [yLow, yHigh] = [quantile(mainYs, 0.05), quantile(mainYs, 0.95)];
  const core = new Uint32Array(main.length);
  let size = 0;
  for (let n = 0; n < main.length; n++) {
    const i = main[n];
    if (xs[i] >= xLow && xs[i] <= xHigh && ys[i] >= yLow && ys[i] <= yHigh) core[size++] = i;
  }
  const body = size > 0 ? core.subarray(0, size) : main;

  let meanX = 0;
  let meanY = 0;
  for (let n = 0; n < body.length; n++) {
    meanX += xs[body[n]];
    meanY += ys[body[n]];
  }
  meanX /= body.length;
  meanY /= body.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let n = 0; n < body.length; n++) {
    const dx = xs[body[n]] - meanX;
    const dy = ys[body[n]] - meanY;
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
  for (let n = 0; n < body.length; n++) {
    const dx = xs[body[n]] - meanX;
    const dy = ys[body[n]] - meanY;
    const along = dx * cosA + dy * sinA;
    const across = -dx * sinA + dy * cosA;
    alongLow = Math.min(alongLow, along);
    alongHigh = Math.max(alongHigh, along);
    acrossLow = Math.min(acrossLow, across);
    acrossHigh = Math.max(acrossHigh, across);
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = body[n];
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

/** The world is this many cells wide, when locations are grouped by the land they lie near */
const BODY_CELLS = 90;
/** Room for every column of cells of unwrapped x, which is within half a world of zero */
const BODY_COLUMNS = 128;

/**
 * The indices of the largest group of locations that lie near each other. A
 * name belongs on the main body of a realm, so that land overseas does not
 * pull it into the sea.
 */
function largestBody(xs: Float64Array, ys: Float64Array, worldWidth: number): Uint32Array {
  const cell = worldWidth / BODY_CELLS;
  const cellOf = new Int32Array(xs.length);
  let rows = 1;
  for (let i = 0; i < xs.length; i++) {
    const row = Math.max(0, Math.floor(ys[i] / cell));
    cellOf[i] = row * BODY_COLUMNS + Math.floor(xs[i] / cell) + BODY_COLUMNS / 2;
    rows = Math.max(rows, row + 1);
  }
  const counts = new Uint32Array(rows * BODY_COLUMNS);
  for (let i = 0; i < cellOf.length; i++) counts[cellOf[i]] += 1;

  // Each cell with land gets the number of its group. Zero is no group yet.
  const group = new Uint32Array(counts.length);
  const stack = new Int32Array(counts.length);
  let groups = 0;
  let best = 0;
  let bestSize = 0;
  for (let i = 0; i < cellOf.length; i++) {
    const start = cellOf[i];
    if (group[start] !== 0) continue;
    groups += 1;
    group[start] = groups;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    while (top > 0) {
      const at = stack[--top];
      size += counts[at];
      const row = Math.floor(at / BODY_COLUMNS);
      const column = at % BODY_COLUMNS;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const [r, c] = [row + dy, column + dx];
          if (r < 0 || r >= rows || c < 0 || c >= BODY_COLUMNS) continue;
          const next = r * BODY_COLUMNS + c;
          if (counts[next] === 0 || group[next] !== 0) continue;
          group[next] = groups;
          stack[top++] = next;
        }
      }
    }
    if (size > bestSize) {
      best = groups;
      bestSize = size;
    }
  }

  const body = new Uint32Array(bestSize);
  let next = 0;
  for (let i = 0; i < cellOf.length; i++) {
    if (group[cellOf[i]] === best) body[next++] = i;
  }
  return body;
}

export type RealmName = {
  text: string;
  shape: RealmShape;
  /** The name moves near its land when the land is too small for it */
  mustShow: boolean;
  /** The name can stand away from its land, with a line to it */
  leaderLine: boolean;
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
const MAX_SIZE = 30;
const CAPITALS_FROM = 18;
/** A realm has this much of its long axis for its name */
const AXIS_SHARE = 0.86;
/** A name leans only when its realm is clearly long, and never steeply */
const MAX_LEAN = Math.PI / 5;
const LONG_REALM = 1.5;
/** The space that each name keeps around it, so that two names never touch */
const NAME_GAP = 4;
/** No name goes nearer than this to the edge of the frame */
const FRAME_MARGIN = 4;
/** A name with a leader line looks around its realm, out to this many pixels. */
const FAR_REACH = 80;
/** The size of a name that stands away from its land */
const NOTE_SIZE = 12;
/** The directions to look in, the nearest to reading order first */
const DIRECTIONS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
  [0.7, -0.7],
  [-0.7, -0.7],
  [0.7, 0.7],
  [-0.7, 0.7],
];

/** The places that a name that must show tries, the nearest first */
function noteOffsets(width: number, height: number, far: boolean): [number, number][] {
  const tries: [number, number][] = [];
  for (const reach of [1, 2]) {
    for (const [x, y] of DIRECTIONS) tries.push([x * width * 0.6 * reach, y * height * reach]);
  }
  if (far) {
    for (const reach of [FAR_REACH / 2, FAR_REACH]) {
      for (const [x, y] of DIRECTIONS) tries.push([x * reach, y * reach]);
    }
  }
  return tries;
}

type Box = { x0: number; y0: number; x1: number; y1: number };

const touches = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const boxOfRect = (rect: Rect): Box => ({
  x0: rect.x,
  y0: rect.y,
  x1: rect.x + rect.width,
  y1: rect.y + rect.height,
});

function textBox(x: number, y: number, width: number, height: number, angle: number): Box {
  const w = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
  const h = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
  return {
    x0: x - w / 2 - NAME_GAP,
    y0: y - h / 2 - NAME_GAP / 2,
    x1: x + w / 2 + NAME_GAP,
    y1: y + h / 2 + NAME_GAP / 2,
  };
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
  const scale = frame.width / view.width;
  const covered = covers.map(boxOfRect);
  const placed: PlacedName[] = [];
  const boxes: Box[] = [];
  const inFrame = (box: Box) =>
    box.x0 >= FRAME_MARGIN &&
    box.x1 <= frame.width - FRAME_MARGIN &&
    box.y0 >= FRAME_MARGIN &&
    box.y1 <= frame.height - FRAME_MARGIN;
  const isFree = (box: Box) =>
    inFrame(box) &&
    !boxes.some((other) => touches(box, other)) &&
    !covered.some((other) => touches(box, other));

  for (const name of names) {
    const { shape } = name;
    const dx = (((shape.center.x - view.x) % worldWidth) + worldWidth) % worldWidth;
    const x = dx * scale;
    const y = (shape.center.y - view.y) * scale;
    const point = { x0: x, y0: y, x1: x, y1: y };
    // A realm whose middle is out of view or under a panel has no name.
    if (!inFrame(point) || covered.some((other) => touches(point, other))) continue;

    const majorPx = shape.major * scale;
    const minorPx = shape.minor * scale;
    const room = majorPx * AXIS_SHARE;
    const asCapitals = room / measure(name.text, true);
    const capitals = asCapitals >= CAPITALS_FROM && minorPx >= CAPITALS_FROM;
    const fitted = capitals
      ? Math.min(asCapitals, Math.max(minorPx * 0.7, CAPITALS_FROM))
      : room / measure(name.text, false);
    const size = Math.min(MAX_SIZE, fitted);
    if (size < MIN_SIZE && !name.mustShow) continue;

    const drawn = Math.max(MIN_SIZE, size);
    const long = shape.major / shape.minor >= LONG_REALM && majorPx > 60;
    // A name reads left to right, so a slope folds into the upright half.
    let lean = shape.angle;
    if (lean > Math.PI / 2) lean -= Math.PI;
    if (lean < -Math.PI / 2) lean += Math.PI;
    const angle = long ? Math.max(-MAX_LEAN, Math.min(MAX_LEAN, lean)) : 0;
    const width = measure(name.text, capitals) * drawn;
    const height = drawn * 1.15;
    const onLand = textBox(x, y, width, height, angle);
    if (size >= MIN_SIZE && isFree(onLand)) {
      boxes.push(onLand);
      placed.push({ text: name.text, x, y, size: drawn, angle, capitals });
      continue;
    }
    if (!name.mustShow) continue;

    // Away from its land a name is a plain note, level and small, so that it does not read as land.
    const noteWidth = measure(name.text, false) * NOTE_SIZE;
    const noteHeight = NOTE_SIZE * 1.15;
    for (const [ox, oy] of [
      [0, 0] as const,
      ...noteOffsets(noteWidth, noteHeight, name.leaderLine),
    ]) {
      const box = textBox(x + ox, y + oy, noteWidth, noteHeight, 0);
      if (!isFree(box)) continue;
      boxes.push(box);
      // A name beside its land needs no line. One further off does.
      const far = Math.hypot(ox, oy) > Math.max(noteWidth / 2, noteHeight * 2);
      placed.push({
        text: name.text,
        x: x + ox,
        y: y + oy,
        size: NOTE_SIZE,
        angle: 0,
        capitals: false,
        ...(far ? { anchor: { x, y } } : {}),
      });
      break;
    }
  }
  return placed;
}
