/**
 * Names set on the land, as an atlas sets them: along the long axis of a realm,
 * with a size that follows its extent, upright, and the most important name first.
 * The functions are pure, so the screen and the exported image place names one way.
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

export type View = { x: number; y: number; width: number; height: number };

const quantile = (sorted: readonly number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];

/**
 * The shape of a realm from the centres of its locations. The world wraps, so x
 * is read around the realm's own middle. The outer 5% on each side go, so that a
 * far colony does not stretch a name across an ocean.
 */
export function realmShape(points: readonly WorldPoint[], worldWidth: number): RealmShape | null {
  if (points.length === 0) return null;
  const turn = (2 * Math.PI) / worldWidth;
  const sin = points.reduce((sum, p) => sum + Math.sin(p.x * turn), 0);
  const cos = points.reduce((sum, p) => sum + Math.cos(p.x * turn), 0);
  const middle = ((Math.atan2(sin, cos) + 2 * Math.PI) % (2 * Math.PI)) / turn;
  const unwrapped = points.map((p) => {
    let x = p.x - middle;
    if (x > worldWidth / 2) x -= worldWidth;
    if (x < -worldWidth / 2) x += worldWidth;
    return { x, y: p.y };
  });
  const main = largestBody(unwrapped, worldWidth);
  const xs = main.map((p) => p.x).sort((a, b) => a - b);
  const ys = main.map((p) => p.y).sort((a, b) => a - b);
  const [xLow, xHigh] = [quantile(xs, 0.05), quantile(xs, 0.95)];
  const [yLow, yHigh] = [quantile(ys, 0.05), quantile(ys, 0.95)];
  const core = main.filter((p) => p.x >= xLow && p.x <= xHigh && p.y >= yLow && p.y <= yHigh);
  const body = core.length > 0 ? core : main;
  const meanX = body.reduce((sum, p) => sum + p.x, 0) / body.length;
  const meanY = body.reduce((sum, p) => sum + p.y, 0) / body.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const p of body) {
    xx += (p.x - meanX) ** 2;
    yy += (p.y - meanY) ** 2;
    xy += (p.x - meanX) * (p.y - meanY);
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const along = body.map((p) => (p.x - meanX) * Math.cos(angle) + (p.y - meanY) * Math.sin(angle));
  const across = body.map(
    (p) => -(p.x - meanX) * Math.sin(angle) + (p.y - meanY) * Math.cos(angle),
  );
  const extent = (values: number[]) => Math.max(...values) - Math.min(...values);
  // The name stands on the realm's own land, and not on a sea that the realm surrounds.
  const nearest = body.reduce((best, p) =>
    (p.x - meanX) ** 2 + (p.y - meanY) ** 2 < (best.x - meanX) ** 2 + (best.y - meanY) ** 2
      ? p
      : best,
  );
  return {
    center: {
      x: (((nearest.x + middle) % worldWidth) + worldWidth) % worldWidth,
      y: nearest.y,
    },
    // One location has no extent, so it has the room of one location.
    major: Math.max(extent(along), worldWidth / 1200),
    minor: Math.max(extent(across), worldWidth / 2400),
    angle,
  };
}

/**
 * The largest group of locations that lie near each other. A name belongs on the
 * main body of a realm, so an overseas holding does not pull it into the sea.
 */
function largestBody(points: readonly WorldPoint[], worldWidth: number): WorldPoint[] {
  const cell = worldWidth / 90;
  const cells = new Map<string, WorldPoint[]>();
  const keyOf = (x: number, y: number) => `${x},${y}`;
  for (const point of points) {
    const key = keyOf(Math.floor(point.x / cell), Math.floor(point.y / cell));
    const members = cells.get(key);
    if (members) members.push(point);
    else cells.set(key, [point]);
  }
  const seen = new Set<string>();
  let best: WorldPoint[] = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [start];
    const body: WorldPoint[] = [];
    while (stack.length > 0) {
      const key = stack.pop() as string;
      body.push(...(cells.get(key) ?? []));
      const [cx, cy] = key.split(",").map(Number);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const next = keyOf(cx + dx, cy + dy);
          if (cells.has(next) && !seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
    }
    if (body.length > best.length) best = body;
  }
  return best;
}

export type RealmName = {
  key: string;
  name: string;
  shape: RealmShape;
  /** A lower number wins a place first */
  priority: number;
  /** A name that must try hard to show, such as a player's */
  must?: boolean;
  /** A name that can stand away from its land, with a line. Others go near it or go out. */
  lead?: boolean;
};

export type PlacedName = {
  key: string;
  name: string;
  /** The centre of the text in frame pixels */
  left: number;
  top: number;
  size: number;
  /** Radians */
  angle: number;
  /** A large realm is set in spaced capitals */
  capitals: boolean;
  /** The realm's place, when the name stands away from it. A line joins the two. */
  anchor?: { left: number; top: number };
};

const MIN_SIZE = 11;
const MAX_SIZE = 30;
/** The width of a character for its size, in capitals with spacing and in lower case */
const CAPITAL_WIDTH = 0.82;
const LOWER_WIDTH = 0.56;
const CAPITALS_FROM = 15;
/** A realm has this much of its long axis for its name */
const AXIS_SHARE = 0.86;
/** A name leans only when its realm is clearly long, and never steeply */
const MAX_LEAN = Math.PI / 5;
const LONG_REALM = 1.5;
/** The space that each name keeps around it, so that two names never touch */
const NAME_GAP = 4;
/** A name that must show looks around its realm, out to this many pixels. */
const FAR_REACH = 80;
/** The size of a name that stands away from its land */
const NOTE_SIZE = 12;
/** The directions that it looks in, the nearest to reading order first */
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
function nameTries(width: number, height: number, far: boolean): [number, number][] {
  const tries: [number, number][] = [[0, 0]];
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

export type Box = { x0: number; y0: number; x1: number; y1: number };

const touches = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function boxOf(left: number, top: number, width: number, height: number, angle: number): Box {
  const w = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
  const h = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
  return {
    x0: left - w / 2 - NAME_GAP,
    y0: top - h / 2 - NAME_GAP / 2,
    x1: left + w / 2 + NAME_GAP,
    y1: top + h / 2 + NAME_GAP / 2,
  };
}

/**
 * Place names for one view of the map. Each name in turn takes the largest size that
 * its realm allows, or none if it would not fit. A name that must show can leave its
 * realm and moves a little when another name is there.
 */
export function placeNames(
  names: readonly RealmName[],
  view: View,
  worldWidth: number,
  frame: { width: number; height: number },
  free: { left: number; right: number; top: number; bottom: number },
  /** Parts of the frame with something over the map, such as the key */
  blocked: readonly Box[] = [],
): { placed: PlacedName[]; missing: string[] } {
  const scale = frame.width / view.width;
  const placed: PlacedName[] = [];
  const boxes: Box[] = [];
  const missing: string[] = [];
  for (const name of [...names].sort((a, b) => a.priority - b.priority)) {
    const { shape } = name;
    const dx = (((shape.center.x - view.x) % worldWidth) + worldWidth) % worldWidth;
    const left = dx * scale;
    const top = (shape.center.y - view.y) * scale;
    if (
      left < free.left ||
      left > frame.width - free.right ||
      top < free.top ||
      top > frame.height - free.bottom
    ) {
      continue;
    }
    const majorPx = shape.major * scale;
    const minorPx = shape.minor * scale;
    const length = Math.max(1, name.name.length);
    const room = majorPx * AXIS_SHARE;
    const asCapitals = room / (length * CAPITAL_WIDTH);
    const capitals = asCapitals >= CAPITALS_FROM && minorPx >= CAPITALS_FROM;
    const fitted = capitals ? asCapitals : room / (length * LOWER_WIDTH);
    const size = Math.min(
      MAX_SIZE,
      fitted,
      capitals ? Math.max(minorPx * 0.7, CAPITALS_FROM) : fitted,
    );
    if (size < MIN_SIZE && !name.must) continue;
    const drawn = Math.max(MIN_SIZE, size);
    const long = shape.major / shape.minor >= LONG_REALM && majorPx > 60;
    // A name reads left to right, so a slope is folded into the upright half.
    let lean = shape.angle;
    if (lean > Math.PI / 2) lean -= Math.PI;
    if (lean < -Math.PI / 2) lean += Math.PI;
    const angle = long ? Math.max(-MAX_LEAN, Math.min(MAX_LEAN, lean)) : 0;
    const width = length * drawn * (capitals ? CAPITAL_WIDTH : LOWER_WIDTH);
    const height = drawn * 1.15;
    const fits = (x: number, y: number, w: number, h: number, a: number) => {
      const box = boxOf(x, y, w, h, a);
      return (
        box.x0 >= free.left &&
        box.x1 <= frame.width - free.right &&
        box.y0 >= free.top &&
        box.y1 <= frame.height - free.bottom &&
        !boxes.some((other) => touches(box, other)) &&
        !blocked.some((other) => touches(box, other))
      );
    };
    const place = (
      x: number,
      y: number,
      setSize: number,
      setAngle: number,
      setCapitals: boolean,
      setWidth: number,
      setHeight: number,
    ) => {
      boxes.push(boxOf(x, y, setWidth, setHeight, setAngle));
      placed.push({
        key: name.key,
        name: name.name,
        left: x,
        top: y,
        size: setSize,
        angle: setAngle,
        capitals: setCapitals,
        // A name beside its realm needs no line. One further off does.
        ...(Math.hypot(x - left, y - top) > Math.max(setWidth / 2, setHeight * 2)
          ? { anchor: { left, top } }
          : {}),
      });
    };
    if (fits(left, top, width, height, angle)) {
      place(left, top, drawn, angle, capitals, width, height);
      continue;
    }
    if (!name.must) continue;
    // Away from its land a name is a plain note, level and small, so it is not read as land.
    const noteWidth = length * NOTE_SIZE * LOWER_WIDTH;
    const noteHeight = NOTE_SIZE * 1.15;
    const spot = nameTries(noteWidth, noteHeight, name.lead === true).find(([ox, oy]) =>
      fits(left + ox, top + oy, noteWidth, noteHeight, 0),
    );
    if (spot) place(left + spot[0], top + spot[1], NOTE_SIZE, 0, false, noteWidth, noteHeight);
    else missing.push(name.name);
  }
  return { placed, missing };
}

/**
 * The order of names: the viewed country, the subject of the headline, the players
 * by their rank, the great powers, then land. So a lower name never takes the place
 * of a higher one.
 */
export function namePriority(label: {
  isHome?: boolean;
  isLeader?: boolean;
  isPlayer: boolean;
  greatPowerRank: number;
  locationCount: number;
}): number {
  if (label.isHome) return 0;
  if (label.isLeader) return 1;
  if (label.isPlayer) return label.greatPowerRank > 0 ? 1 + label.greatPowerRank : 900;
  if (label.greatPowerRank > 0 && label.greatPowerRank <= 10) return 1000 + label.greatPowerRank;
  return 2000 + 100000 / Math.max(1, label.locationCount);
}
