/**
 * What the date plate on an exported film is painted with, read from the
 * page. The plate itself is drawn in the map worker, which has no document;
 * the colors and fonts go to it with the recording.
 */

import type { DatePlateColors, DatePlateFonts } from "@pdx.tools/timelapse";
import plexMono500 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url";
import plexMono600 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2?url";

/**
 * The element the game tokens are declared on. They live on a wrapper inside
 * the body, so the body itself does not carry them.
 */
function themeRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-game-theme]") ?? document.body;
}

/**
 * Read the design tokens out of the document so the film is painted in the
 * same colors as the app rather than in a second set that drifts from it.
 *
 * The browser resolves each token to a plain color, which is what a canvas
 * can paint with.
 */
export function readDatePlateColors(): DatePlateColors {
  const probe = document.createElement("span");
  probe.style.display = "none";
  themeRoot().appendChild(probe);

  const resolve = (token: string, fallback: string) => {
    probe.style.color = fallback;
    probe.style.color = `var(${token})`;
    const color = getComputedStyle(probe).color;
    return color || fallback;
  };

  try {
    return {
      panel: resolve("--game-panel", "#12161b"),
      line: "rgba(255, 255, 255, 0.1)",
      year: resolve("--game-ink-100", "#f0ebe3"),
      month: resolve("--game-ink-300", "#cdc6bb"),
    };
  } finally {
    probe.remove();
  }
}

/** The family the plate's files belong to. */
const PLATE_FAMILY = "IBM Plex Mono";

/**
 * The plate's face: the page's numeral face, with the files at the two
 * weights the plate uses. They are the same files the page loads for
 * `--font-game-num`, named here so a worker can load them into its own
 * font set before it draws the first frame.
 *
 * The page's `--font-game-num` is a stack. It is kept for `ctx.font` as the
 * plate's fallbacks, but the files register under the one family they are.
 */
export function readDatePlateFonts(): DatePlateFonts {
  const style = getComputedStyle(themeRoot());
  const pageStack = style.getPropertyValue("--font-game-num").trim();
  const stack = pageStack.includes(PLATE_FAMILY)
    ? pageStack
    : `"${PLATE_FAMILY}", ${pageStack || "monospace"}`;
  return {
    family: PLATE_FAMILY,
    stack,
    faces: [
      { weight: "500", url: plexMono500 },
      { weight: "600", url: plexMono600 },
    ],
  };
}
