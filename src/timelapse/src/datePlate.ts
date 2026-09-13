/**
 * The one thing burned into an exported timelapse: the date, to the month.
 *
 * The month is what ties the plate to the map: a border that moves mid-year
 * moves against a date that is visibly advancing, where a plate that only
 * ticked once a year would leave the map changing on its own. The day is
 * left off. A frame advances the campaign by weeks at a time, so a day would
 * only flicker through values nobody can read.
 *
 * The whole plate is set in the numeral face. A canvas cannot ask a
 * proportional face for tabular figures, so a year set in the UI face would
 * shuffle its glyphs as a digit changed width; in the monospace face every
 * figure holds its cell and only the changed digit moves. The plate is cut
 * from the same tokens as every other surface in the analysis: a clip that
 * travels to Reddit keeps the product's handwriting without advertising it.
 */

import type { DateComponents } from "./frame";

const MONTH_ABBR = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Height of the plate at 1080p. Sized to sit inside the 60px matte band that
 * a 2:1 world leaves in a 16:9 frame, as large as that band allows: the film
 * is watched at a fraction of its size, and a year that reads in a feed
 * preview is the whole point of the plate.
 */
const PLATE_HEIGHT = 52;
const PLATE_RADIUS = 5;
const PLATE_INSET = 28;
const PLATE_PADDING = 16;
const YEAR_SIZE = 34;
const MONTH_SIZE = 17;
const FIGURE_GAP = 10;

export type DatePlateColors = {
  /** The plate's ground. Opaque, so redrawing a frame never builds up. */
  panel: string;
  line: string;
  year: string;
  month: string;
};

export type DatePlateFace = { weight: string; url: string };

export type DatePlateFonts = {
  /**
   * The one family name the files below are registered under. `FontFace`
   * takes a single family, not a stack; a stack throws a `SyntaxError`.
   */
  family: string;
  /**
   * The stack the plate is set in for `ctx.font`: `family` first, then the
   * page's fallbacks for any glyph the files do not cover.
   */
  stack: string;
  /**
   * The files of `family`, at the weights the plate uses. A worker has no
   * document and no stylesheet, so it loads them into its own font set
   * before it draws the first frame.
   */
  faces: readonly DatePlateFace[];
};

/**
 * Load the plate's faces into `fontSet`, the font set of whichever global
 * scope the plate is drawn in. A film whose first second is set in Times is
 * a defect, so the recording waits on this before its first frame.
 */
export async function loadDatePlateFonts(
  fontSet: FontFaceSet,
  fonts: DatePlateFonts,
): Promise<void> {
  const faces = fonts.faces.map(
    ({ weight, url }) => new FontFace(fonts.family, `url(${url})`, { weight }),
  );
  await Promise.all(
    faces.map(async (face) => {
      fontSet.add(face);
      await face.load();
    }),
  );
}

/**
 * Draw the date over a rendered frame.
 *
 * `bandTop` and `bandBottom` are the edges of the map inside the frame. When
 * the 2:1 world sits in a 16:9 output there is a matte below the map, and the
 * plate goes in it, covering nothing. When the map fills the frame the plate
 * sits over its bottom-left corner instead, which is where the app's own bar
 * lives.
 */
export function drawDatePlate({
  ctx,
  date,
  scale,
  colors,
  fonts,
  bandBottom,
  matte,
}: {
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  date: DateComponents;
  /** Output height over 1080, so a 720p film carries the same proportions. */
  scale: number;
  colors: DatePlateColors;
  fonts: DatePlateFonts;
  /** Where the rendered map ends, in output pixels. */
  bandBottom: number;
  /** The frame's matte color, for the strip the plate sits in below the map. */
  matte: string;
}) {
  const height = PLATE_HEIGHT * scale;
  const radius = PLATE_RADIUS * scale;
  const padding = PLATE_PADDING * scale;
  const inset = PLATE_INSET * scale;

  const yearText = String(date.year);
  const monthText = MONTH_ABBR[date.month];
  const yearFont = `600 ${YEAR_SIZE * scale}px ${fonts.stack}`;
  const monthFont = `500 ${MONTH_SIZE * scale}px ${fonts.stack}`;

  // The plate holds one width for the whole film: four figures, and the
  // widest month. It must not breathe as the year ticks from 999 to 1000 or
  // the month from May to September — and a plate that narrows would leave
  // its old right edge standing in the matte, which is painted once.
  ctx.font = yearFont;
  const figureWidth = ctx.measureText("0").width;
  const yearWidth = figureWidth * Math.max(4, yearText.length);
  ctx.font = monthFont;
  const monthWidth = Math.max(...MONTH_ABBR.map((m) => ctx.measureText(m).width));
  const width = padding * 2 + yearWidth + FIGURE_GAP * scale + monthWidth;

  // Below the map when there is room under it, over the map when there is not.
  const matteHeight = ctx.canvas.height - bandBottom;
  const inMatte = matteHeight >= height + 4 * scale;
  const y = inMatte ? bandBottom + (matteHeight - height) / 2 : ctx.canvas.height - height - inset;

  ctx.save();

  // In the matte nothing else repaints this strip, so the plate clears its own
  // ground. Over the map the frame under it is already fresh.
  if (inMatte) {
    ctx.fillStyle = matte;
    ctx.fillRect(0, bandBottom, ctx.canvas.width, matteHeight);
  }

  ctx.beginPath();
  ctx.roundRect(inset, y, width, height, radius);
  ctx.fillStyle = colors.panel;
  ctx.fill();
  ctx.lineWidth = Math.max(1, scale);
  ctx.strokeStyle = colors.line;
  ctx.stroke();

  // Both sizes share one baseline, the way the readout in the app does,
  // centered on the plate from the figures' real ascent rather than the
  // font's, so the year does not sit low.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = yearFont;
  const yearMetrics = ctx.measureText(yearText);
  const baselineY = y + height / 2 + yearMetrics.actualBoundingBoxAscent / 2;

  // The year is right-aligned inside its column, so a three-figure year
  // sits against the month as a four-figure one does.
  const yearRight = inset + padding + yearWidth;
  ctx.textAlign = "right";
  ctx.fillStyle = colors.year;
  ctx.fillText(yearText, yearRight, baselineY);

  ctx.textAlign = "left";
  ctx.font = monthFont;
  ctx.fillStyle = colors.month;
  ctx.fillText(monthText, yearRight + FIGURE_GAP * scale, baselineY);
  ctx.restore();
}
