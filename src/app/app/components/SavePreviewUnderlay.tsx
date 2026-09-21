import { useEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";

type SavePreviewUnderlayProps = {
  /** The shared save's preview image (its OG image). */
  src: string;
  /**
   * Text-color classes that name the page ground (for example
   * `text-game-page`). The wash and the scrim behind the readout use it.
   */
  groundClassName: string;
};

/**
 * The shared save's preview, blurred and washed, behind a loading screen.
 *
 * The visitor usually arrives from an embed that showed this same image, so
 * the page opens on it while the save downloads and parses. It is a tint of
 * the player's world, not a blur-up: the preview is a different framing from
 * the live map, so it dissolves with the loader instead of sharpening into
 * the map.
 *
 * The image fades in only once it has decoded. When it fails to load (the
 * preview is rendered after the upload finishes, so a fresh share can beat
 * it) the loader keeps its plain ground.
 */
export function SavePreviewUnderlay({ src, groundClassName }: SavePreviewUnderlayProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"pending" | "loaded" | "failed">("pending");

  // The loading screen stays mounted when the visitor moves from one shared
  // save to another, so each new preview starts from pending again.
  const [shownSrc, setShownSrc] = useState(src);
  if (shownSrc !== src) {
    setShownSrc(src);
    setStatus("pending");
  }

  // A cached image can finish before hydration attaches onLoad.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0 && img.currentSrc.endsWith(src)) {
      setStatus("loaded");
    }
  }, [src]);

  if (status === "failed") return null;

  return (
    <div className={cx("absolute inset-0 overflow-hidden", groundClassName)} aria-hidden="true">
      <img
        ref={ref}
        src={src}
        alt=""
        decoding="async"
        fetchPriority="low"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("failed")}
        className={cx(
          "h-full w-full scale-110 object-cover blur-xl",
          "transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          status === "loaded" ? "opacity-100" : "opacity-0",
        )}
      />
      {/* A uniform wash keeps the map a tint; the scrim holds the readout's contrast. */}
      <div className="absolute inset-0 bg-current opacity-65" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_45%,currentColor_0%,transparent_100%)]" />
    </div>
  );
}
