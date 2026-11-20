import latin from "@fontsource/public-sans/files/public-sans-latin-600-normal.woff2?url";
import latinExt from "@fontsource/public-sans/files/public-sans-latin-ext-600-normal.woff2?url";
import vietnamese from "@fontsource/public-sans/files/public-sans-vietnamese-600-normal.woff2?url";
import type { MapNames } from "./map-module";
import { CAPITAL_SPACING, LEADER_HALO, placeNames, realmShape } from "./atlas";
import type { MeasureText, PlacedName, RealmName, RealmShape, Rect } from "./atlas";

/** The face of the page's game text, with the ranges that each file holds */
const FACES = [
  {
    url: latin,
    unicodeRange:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  },
  {
    url: latinExt,
    unicodeRange:
      "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  },
  {
    url: vietnamese,
    unicodeRange:
      "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
  },
];

const font = (size: number) => `600 ${size}px "Public Sans", system-ui, sans-serif`;

/** The size that a text is measured at. Widths scale with the size. */
const MEASURE_SIZE = 100;

/** The dark of the halo, so that a name reads on any color of land */
const HALO = "10, 12, 16";

type Frame = { width: number; height: number; scaleFactor: number };

/** The point of a location that is not on the map */
const NOT_ON_MAP = 0xffffffff;

/** A realm's land and its shape */
type Shaped = { land: Uint16Array; shape: RealmShape | null };

function sameLand(a: Uint16Array, b: Uint16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** A key for a list of locations: its length and a hash of its ids */
function landKey(locations: Uint16Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < locations.length; i++) hash = Math.imul(hash ^ locations[i], 0x01000193);
  return `${locations.length}:${hash >>> 0}`;
}

/**
 * The names on the map, drawn on their own canvas over it. The map worker
 * draws them in the same frame as the map, so they move with it exactly.
 */
export class MapNameLayer {
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private names: RealmName[] = [];
  /** The shapes of the last names, by a key of their land */
  private shapes = new Map<string, Shaped>();
  /** Names that have come but have no shapes yet */
  private pending: MapNames | null = null;
  private covers: Rect[] = [];
  private visible = true;
  /** The names, covers or canvas changed since the last draw */
  private dirty = true;
  private lastView: Rect | null = null;
  /** The canvas has nothing on it */
  private blank = true;
  private readonly widths = new Map<string, number>();
  private frame: Frame;

  /**
   * @param map Each location's middle as `[x, y]` pairs by color id, and the
   * width of the world. They are of one map, so a shape stays true.
   */
  constructor(
    private readonly canvas: OffscreenCanvas,
    frame: Frame,
    private readonly map: { points: Uint32Array; worldWidth: number },
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context for the map names");
    this.ctx = ctx;
    this.frame = frame;
    this.resize(frame);
    // A canvas that lost its picture draws the names again.
    canvas.addEventListener("contextrestored", () => {
      this.dirty = true;
    });
    void this.loadFont();
  }

  /** Take the names for the map. They get their shapes when they show. */
  setNames(names: MapNames): void {
    this.pending = names;
    this.dirty = true;
  }

  /** Give the names their shapes, only when they are about to show. */
  private shapeNames(): void {
    if (this.pending === null) return;
    const { names, locations } = this.pending;
    const { points, worldWidth } = this.map;
    this.pending = null;
    const shapes = new Map<string, Shaped>();
    let start = 0;
    this.names = names.flatMap((name) => {
      const land = locations.subarray(start, start + name.locationCount);
      start += name.locationCount;
      // A step on the timeline changes the land of few realms. The others keep their shape.
      const key = landKey(land);
      const known = shapes.get(key) ?? this.shapes.get(key);
      // Two lists of land can have one key, so the land must also be the same.
      let shape = known && sameLand(known.land, land) ? known.shape : undefined;
      if (shape === undefined) {
        const at = new Float64Array(land.length * 2);
        let size = 0;
        for (const id of land) {
          const x = points[id * 2];
          if (x === undefined || x === NOT_ON_MAP) continue;
          at[size++] = x;
          at[size++] = points[id * 2 + 1];
        }
        shape = realmShape(at.subarray(0, size), worldWidth);
      }
      shapes.set(key, { land, shape });
      return shape ? [{ text: name.text, shape, placement: name.placement }] : [];
    });
    // No names, as over a snapshot, keep the shapes for when the names come back.
    if (names.length > 0) this.shapes = shapes;
  }

  /** The parts of the frame that panels cover, in CSS pixels */
  setCovers(covers: Rect[]): void {
    this.covers = covers;
    this.dirty = true;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.dirty = true;
  }

  /** Match the size of the map canvas, in device pixels */
  resize(frame: Frame): void {
    const same =
      frame.width === this.frame.width &&
      frame.height === this.frame.height &&
      frame.scaleFactor === this.frame.scaleFactor;
    if (same && this.canvas.width === frame.width && this.canvas.height === frame.height) return;
    this.frame = frame;
    this.canvas.width = frame.width;
    this.canvas.height = frame.height;
    this.blank = true;
    this.dirty = true;
  }

  /** Draw the names for this view, when it or the names changed. */
  draw(view: Rect): void {
    const last = this.lastView;
    if (
      !this.dirty &&
      last &&
      last.x === view.x &&
      last.y === view.y &&
      last.width === view.width &&
      last.height === view.height
    ) {
      return;
    }
    this.dirty = false;
    this.lastView = view;

    const { ctx, frame } = this;
    if (this.visible) this.shapeNames();
    const empty = !this.visible || this.names.length === 0;
    if (empty && this.blank) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, frame.width, frame.height);
    this.blank = true;
    if (empty) return;

    const size = {
      width: frame.width / frame.scaleFactor,
      height: frame.height / frame.scaleFactor,
    };
    const placed = placeNames(
      this.names,
      view,
      this.map.worldWidth,
      size,
      this.covers,
      this.measure,
    );
    ctx.setTransform(frame.scaleFactor, 0, 0, frame.scaleFactor, 0, 0);
    ctx.lineJoin = "round";
    for (const name of placed) {
      if (name.leader) drawLeader(ctx, name);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const name of placed) drawName(ctx, name);
    this.blank = placed.length === 0;
  }

  private readonly measure: MeasureText = (text, capitals) => {
    const key = `${capitals ? "^" : "_"}${text}`;
    let width = this.widths.get(key);
    if (width === undefined) {
      this.ctx.font = font(MEASURE_SIZE);
      this.ctx.letterSpacing = "0px";
      const shown = capitals ? text.toUpperCase() : text;
      width =
        this.ctx.measureText(shown).width / MEASURE_SIZE +
        (capitals ? shown.length * CAPITAL_SPACING : 0);
      this.widths.set(key, width);
    }
    return width;
  };

  /**
   * Load the face into this worker. Until then, the names use a fallback
   * face. Each file changes the widths of its letters when it loads.
   */
  private async loadFont(): Promise<void> {
    const { fonts } = self as unknown as { fonts?: FontFaceSet };
    if (!fonts) return;
    await Promise.all(
      FACES.map(async ({ url, unicodeRange }) => {
        const face = new FontFace("Public Sans", `url(${url})`, { weight: "600", unicodeRange });
        fonts.add(face);
        try {
          await face.load();
        } catch (error) {
          console.warn("The map names keep a fallback face for some letters", error);
          return;
        }
        this.widths.clear();
        this.dirty = true;
      }),
    );
  }
}

function drawLeader(ctx: OffscreenCanvasRenderingContext2D, name: PlacedName): void {
  const { leader } = name;
  if (!leader) return;
  ctx.beginPath();
  ctx.moveTo(leader.from.x, leader.from.y);
  ctx.lineTo(leader.to.x, leader.to.y);
  ctx.strokeStyle = `rgba(${HALO}, 0.85)`;
  ctx.lineWidth = LEADER_HALO * 2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawName(ctx: OffscreenCanvasRenderingContext2D, name: PlacedName): void {
  const text = name.capitals ? name.text.toUpperCase() : name.text;
  ctx.save();
  ctx.translate(name.x, name.y);
  ctx.rotate(name.angle);
  ctx.font = font(name.size);
  const spacing = name.capitals ? name.size * CAPITAL_SPACING : 0;
  ctx.letterSpacing = `${spacing}px`;
  // The space after the last letter would move the text off its middle.
  ctx.translate(spacing / 2, 0);
  // A halo in place of a chip, so that the name sits on the land: a wide soft
  // edge, then a narrow dark one.
  ctx.strokeStyle = `rgba(${HALO}, 0.45)`;
  ctx.lineWidth = Math.max(4, name.size * 0.3);
  ctx.strokeText(text, 0, 0);
  ctx.strokeStyle = `rgba(${HALO}, 0.9)`;
  ctx.lineWidth = Math.max(2, name.size * 0.12);
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
