/**
 * Framing math for a timelapse recording.
 *
 * A recording renders to its own surface, so the film is the size the player
 * chose and not the size of the window they happen to have open. These
 * functions decide two things: which rectangle of the world each frame shows,
 * and how large the rendered band is inside the output frame.
 */

/** A calendar date as the games' workers report it. Months and days count from 1. */
export type DateComponents = { year: number; month: number; day: number };

export type WorldRect = { x: number; y: number; width: number; height: number };
export type FrameSize = { width: number; height: number };

/** The world and the rectangle of it the live map shows, in world units. */
export type MapViewport = { world: FrameSize; viewport: WorldRect };

/** Which part of the world the film shows. */
export type TimelapseFraming = "world" | "view";

export type TimelapseFrameLayout = {
  /** The world rectangle every frame renders, in world units. */
  rect: WorldRect;
  /** The size of the rendered band, in pixels. Never larger than the output. */
  band: FrameSize;
  /** Where the band sits in the output frame. The rest is matte. */
  offset: { x: number; y: number };
};

/** H.264 encodes even dimensions only, so every surface lands on an even size. */
function even(value: number): number {
  return Math.max(2, 2 * Math.round(value / 2));
}

/**
 * Grow `rect` to `aspect` around its center without losing anything already
 * inside it, then keep it within the world.
 *
 * Growing rather than cropping is the point: the player framed the view they
 * want, and a 16:9 film of a 4:3 window should add sea, never cut Anatolia.
 * The world wraps east to west, so only the height needs to stay in bounds.
 */
export function expandToAspect(rect: WorldRect, world: FrameSize, aspect: number): WorldRect {
  let width = rect.width;
  let height = rect.height;

  if (width / height < aspect) {
    width = height * aspect;
  } else {
    height = width / aspect;
  }

  // A rectangle taller than the world cannot be shown, so the world's height
  // becomes the limit and the width grows instead.
  if (height > world.height) {
    height = world.height;
    width = height * aspect;
  }
  if (width > world.width) {
    width = world.width;
    height = width / aspect;
  }

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  return {
    // East and west are one continuous surface: an origin past the antimeridian
    // wraps rather than clamps.
    x: Math.round((centerX - width / 2 + world.width) % world.width),
    y: Math.round(Math.min(Math.max(centerY - height / 2, 0), world.height - height)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * Lay out one recorded frame.
 *
 * `world` framing shows the campaign whole. The world is twice as wide as it
 * is tall and the output is 16:9, so the band fills the width and the frame
 * keeps a matte above and below it — which is also where the date plate goes,
 * clear of the map.
 *
 * `view` framing takes the rectangle the player has panned and zoomed to,
 * grown to the output's shape, and fills the frame with it.
 */
export function layoutTimelapseFrame({
  framing,
  viewport,
  world,
  output,
}: {
  framing: TimelapseFraming;
  viewport: WorldRect;
  world: FrameSize;
  output: FrameSize;
}): TimelapseFrameLayout {
  const aspect = output.width / output.height;
  const rect =
    framing === "world"
      ? { x: 0, y: 0, width: world.width, height: world.height }
      : expandToAspect(viewport, world, aspect);

  // Fit the rectangle inside the output frame without distorting it.
  const scale = Math.min(output.width / rect.width, output.height / rect.height);
  const band = {
    width: Math.min(output.width, even(rect.width * scale)),
    height: Math.min(output.height, even(rect.height * scale)),
  };

  return {
    rect,
    band,
    offset: {
      x: Math.round((output.width - band.width) / 2),
      y: Math.round((output.height - band.height) / 2),
    },
  };
}
