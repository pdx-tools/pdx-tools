/**
 * The track beside the date plate: the whole span of the film on one line,
 * with a playhead at the date on screen.
 *
 * The plate tells the viewer what date it is. The track tells them where that
 * date sits in the campaign, and how much of it is still to come, in years
 * rather than in seconds. A film of saved dates holds each date for the same
 * time, however far apart the saves are, so its track carries a mark at each
 * saved date: a long empty stretch between two marks is time the film skips,
 * and the playhead jumps across it. A continuous film skips nothing, so its
 * track carries a few faint notches at round years instead, for scale.
 *
 * The track is quieter than the plate. When the map leaves a matte below it,
 * the track runs across the matte. When the map fills the frame, the track
 * sits on its own panel next to the plate, so the map under it does not
 * hide the marks.
 */

import type { DateComponents } from "./frame";
import type { DatePlateColors, DatePlateFonts, DatePlateBox } from "./datePlate";

/** What the track of a film shows. */
export type TimelapseTrack = {
  /** The first date of the film. */
  start: DateComponents;
  /** The last date of the film. */
  end: DateComponents;
  /**
   * The saved dates the film holds as stills, in order. Empty for a
   * continuous film.
   */
  saves: readonly DateComponents[];
};

/** Sizes at 1080p. */
const GAP = 28;
/** Over the map: the space between the plate and the track's panel, and the panel's width. */
const PANEL_GAP = 8;
const PANEL_WIDTH = 720;
const PANEL_PADDING = 18;
const LABEL_GAP = 14;
const LABEL_SIZE = 17;
const TRACK_HEIGHT = 2;
const NOTCH = 6;
const SAVE_MARK = 12;
const PLAYHEAD_WIDTH = 4;
const PLAYHEAD_HEIGHT = 22;

/**
 * The round-year steps a continuous film's notches can take, finest first.
 * The finest step that leaves room between notches is used.
 */
const NOTCH_STEPS = [10, 25, 50, 100, 200];
const MIN_NOTCH_GAP = 120;

/** Neither game's calendar has a leap day. */
const DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function dayNumber(date: DateComponents): number {
  return date.year * 365 + DAYS_BEFORE_MONTH[date.month] + (date.day - 1);
}

/**
 * Where `date` falls on `track`, from 0 at its start to 1 at its end. A film
 * of one date sits at the end.
 */
export function trackPosition(track: TimelapseTrack, date: DateComponents): number {
  const span = dayNumber(track.end) - dayNumber(track.start);
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (dayNumber(date) - dayNumber(track.start)) / span));
}

/** The years a continuous film's notches sit on, between its start and end. */
export function trackNotchYears(track: TimelapseTrack, trackWidth: number): number[] {
  const years = (dayNumber(track.end) - dayNumber(track.start)) / 365;
  if (years <= 0 || trackWidth <= 0) return [];
  const pxPerYear = trackWidth / years;
  const step = NOTCH_STEPS.find((s) => s * pxPerYear >= MIN_NOTCH_GAP);
  if (step === undefined) return [];

  const result: number[] = [];
  for (let year = Math.ceil(track.start.year / step) * step; year <= track.end.year; year += step) {
    const position = trackPosition(track, { year, month: 1, day: 1 });
    // A notch on top of an end of the track tells nothing.
    if (position > 0 && position < 1) result.push(year);
  }
  return result;
}

/**
 * Draw the track to the right of the plate in `plate`. The plate has already
 * cleared the matte, so the track draws over a fresh ground.
 */
export function drawTimelapseTrack({
  ctx,
  track,
  date,
  scale,
  colors,
  fonts,
  plate,
}: {
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  track: TimelapseTrack;
  date: DateComponents;
  scale: number;
  colors: DatePlateColors;
  fonts: DatePlateFonts;
  plate: DatePlateBox;
}) {
  const y = plate.y + plate.height / 2;
  const startText = String(track.start.year);
  const endText = String(track.end.year);

  ctx.save();
  ctx.font = `500 ${LABEL_SIZE * scale}px ${fonts.stack}`;
  ctx.textBaseline = "middle";

  let left: number;
  let right: number;
  if (plate.inMatte) {
    left = plate.right + GAP * scale;
    right = ctx.canvas.width - plate.inset;
  } else {
    // The panel has the plate's ground and edge, so the two read as one unit.
    const panelLeft = plate.right + PANEL_GAP * scale;
    const panelRight = Math.min(ctx.canvas.width - plate.inset, panelLeft + PANEL_WIDTH * scale);
    ctx.beginPath();
    ctx.roundRect(panelLeft, plate.y, panelRight - panelLeft, plate.height, plate.radius);
    ctx.fillStyle = colors.panel;
    ctx.fill();
    ctx.lineWidth = Math.max(1, scale);
    ctx.strokeStyle = colors.line;
    ctx.stroke();
    left = panelLeft + PANEL_PADDING * scale;
    right = panelRight - PANEL_PADDING * scale;
  }
  const trackLeft = left + ctx.measureText(startText).width + LABEL_GAP * scale;
  const trackRight = right - ctx.measureText(endText).width - LABEL_GAP * scale;
  const trackWidth = trackRight - trackLeft;
  if (trackWidth <= 0) {
    ctx.restore();
    return;
  }

  ctx.fillStyle = colors.trackLabel;
  ctx.textAlign = "left";
  ctx.fillText(startText, left, y);
  ctx.textAlign = "right";
  ctx.fillText(endText, right, y);

  const x = (position: number) => trackLeft + position * trackWidth;
  const bar = (left: number, width: number, height: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(left, y - height / 2, width, height);
  };

  const playhead = x(trackPosition(track, date));
  const markWidth = Math.max(1, scale);

  // The notches go under the track, so the played part of it runs unbroken.
  if (track.saves.length === 0) {
    for (const year of trackNotchYears(track, trackWidth)) {
      const notchX = x(trackPosition(track, { year, month: 1, day: 1 }));
      bar(notchX - markWidth / 2, markWidth, NOTCH * scale, colors.track);
    }
  }

  // The track, and the part of it the film has played, brighter.
  const trackHeight = Math.max(1, TRACK_HEIGHT * scale);
  bar(trackLeft, trackWidth, trackHeight, colors.track);
  bar(trackLeft, playhead - trackLeft, trackHeight, colors.trackPlayed);

  for (const save of track.saves) {
    const markX = x(trackPosition(track, save));
    bar(markX - markWidth / 2, markWidth, SAVE_MARK * scale, colors.trackSave);
  }

  const playheadWidth = PLAYHEAD_WIDTH * scale;
  ctx.beginPath();
  ctx.roundRect(
    playhead - playheadWidth / 2,
    y - (PLAYHEAD_HEIGHT * scale) / 2,
    playheadWidth,
    PLAYHEAD_HEIGHT * scale,
    playheadWidth / 2,
  );
  ctx.fillStyle = colors.year;
  ctx.fill();
  ctx.restore();
}
