export const CHART_UPDATE_DURATION = 800;
export const CHART_UPDATE_EASING = "cubicInOut";
export const DOM_TRANSITION_DURATION = 800;
export const DOM_TRANSITION_EASING = "cubic-bezier(.22,.61,.36,1)";
export const HIGHLIGHT_DURATION = 1000;
export const HIGHLIGHT_EASING = "ease-out";

/** Pace animations to at most 60 Hz so high-refresh displays do not multiply main-thread work. */
export const FRAME_INTERVAL_MS = 1000 / 60 - 0.5;

export const easeChartUpdate = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export const interpolate = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

export const clampedProgress = (started: number, duration: number, now: number) =>
  duration > 0 ? easeChartUpdate(Math.max(0, Math.min(1, (now - started) / duration))) : 1;

/**
 * Finish frequent playback transitions before the next observation arrives.
 * Slower updates retain the full duration.
 */
export const adaptiveDuration = (
  lastUpdateAt: number | null,
  now: number,
  maxDuration = CHART_UPDATE_DURATION,
) =>
  lastUpdateAt == null
    ? maxDuration
    : Math.min(maxDuration, Math.max(0, (now - lastUpdateAt) * 0.8));

let reducedMotionQuery: MediaQueryList | undefined;
const reducedMotionListeners = new Set<() => void>();

function ensureReducedMotionQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  if (reducedMotionQuery) return reducedMotionQuery;
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", () => {
    for (const listener of reducedMotionListeners) listener();
  });
  reducedMotionQuery = query;
  return query;
}

/** Shared reduced-motion check backed by one MediaQueryList instead of per-cell matchMedia calls. */
export function prefersReducedMotion(): boolean {
  return ensureReducedMotionQuery()?.matches ?? false;
}

export function subscribeReducedMotion(listener: () => void): () => void {
  ensureReducedMotionQuery();
  reducedMotionListeners.add(listener);
  return () => {
    reducedMotionListeners.delete(listener);
  };
}

/**
 * 60 Hz animation frame loop matching ZRender's throttled clock so overlay layers
 * stay visually locked to ECharts axes and labels.
 */
export function createFrameLoop(render: (now: number) => boolean) {
  let raf = 0;
  let lastFrame = -Infinity;

  const tick = () => {
    raf = 0;
    const now = performance.now();
    if (now - lastFrame < FRAME_INTERVAL_MS) {
      raf = requestAnimationFrame(tick);
      return;
    }
    lastFrame = now;
    if (render(now)) raf = requestAnimationFrame(tick);
  };

  return {
    start(immediate = true) {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (immediate) {
        const now = performance.now();
        lastFrame = now;
        if (render(now)) raf = requestAnimationFrame(tick);
      } else {
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}
