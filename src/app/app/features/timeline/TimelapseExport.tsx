import { useId, useState } from "react";
import { cx } from "class-variance-authority";
import { ToggleGroup } from "radix-ui";
import { VideoCameraIcon } from "@heroicons/react/24/outline";
import { Popover } from "@/components/Popover";
import { Tooltip } from "@/components/Tooltip";
import { downloadData } from "@/lib/downloadData";
import { emitEvent } from "@/lib/events";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { captureException } from "@/lib/captureException";
import { toast } from "@/lib/toast";
import { GameButton } from "@/components/game/Button";
import { SectionTitle } from "@/components/game/SectionTitle";
import { focusRing } from "@/components/game/focusRing";
import type { TimelapseProgress, TimelapseStatus, TimelineController } from "./controller";
import {
  TIMELAPSE_QUALITIES,
  expandToAspect,
  formatCampaignSpan,
  formatDuration,
  formatFileSize,
  isTimelapseSupported,
  timelapsePlan,
} from "@pdx.tools/timelapse";
import type {
  MapViewport,
  TimelapseFile,
  TimelapseFraming,
  TimelapseOptions,
  WorldRect,
} from "@pdx.tools/timelapse";
import { WORLD_PATH } from "./worldSilhouette";
import type { WorldSilhouette } from "./worldSilhouette";
import styles from "./TimelapseExport.module.css";

/** The thumbnail's frame is 16:9, like the film; the world sits inside it. */
const THUMB = { width: 360, height: 202.5 };

/**
 * The world's box in the thumbnail. It spans the frame's width, so a wider
 * world (EU4's map is 2.75:1) is a shorter band with a deeper matte, and a
 * frame drawn over it keeps the shape it has on the real map.
 */
function worldBox(worldAspect: number) {
  const height = THUMB.width / worldAspect;
  return { width: THUMB.width, height, top: (THUMB.height - height) / 2 };
}

const FRAMINGS: { id: TimelapseFraming; label: string }[] = [
  { id: "world", label: "Whole world" },
  { id: "view", label: "The current view of the map" },
];

/** The rectangle a recording of the current view would frame, in thumbnail units. */
function viewFrameRects(mapViewport: MapViewport): WorldRect[] {
  const { world, viewport } = mapViewport;
  const box = worldBox(world.width / world.height);
  const rect = expandToAspect(viewport, world, THUMB.width / THUMB.height);
  const sx = box.width / world.width;
  const sy = box.height / world.height;
  const scaled = {
    x: rect.x * sx,
    y: rect.y * sy + box.top,
    width: rect.width * sx,
    height: rect.height * sy,
  };
  // The world wraps east to west, so a frame past the antimeridian is drawn
  // in two pieces.
  const overflow = scaled.x + scaled.width - box.width;
  if (overflow <= 0) return [scaled];
  return [
    { ...scaled, width: scaled.width - overflow },
    { ...scaled, x: 0, width: overflow },
  ];
}

/**
 * The framing choice as two thumbnails of the same world. One is the whole
 * of it in the frame; the other veils everything the current view would
 * leave out, and follows the map as it is panned and zoomed, so the choice
 * is a picture of what the film will show and needs no caption. The name of
 * each goes to assistive tech.
 *
 * `world` says how the shared outline maps onto the game's map: the box is
 * 360 units across and `360 / aspect` tall, and the outline's `window` rows
 * are stretched to fill it.
 */
function FramingPicker({
  value,
  onChange,
  mapViewport,
  world,
}: {
  value: TimelapseFraming;
  onChange: (value: TimelapseFraming) => void;
  mapViewport: MapViewport | null;
  world: WorldSilhouette;
}) {
  const box = worldBox(world.aspect);
  const frames = mapViewport ? viewFrameRects(mapViewport) : [];
  // The outline's window, scaled to the map's box.
  const windowHeight = world.window.bottom - world.window.top;
  const outlineTransform = `translate(0 ${box.top}) scale(1 ${box.height / windowHeight}) translate(0 ${-world.window.top})`;
  const clipId = useId();
  const veil =
    `M0 0h${THUMB.width}v${THUMB.height}H0Z ` +
    frames.map((r) => `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}Z`).join(" ");

  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label="Framing"
      onValueChange={(next) => next && onChange(next as TimelapseFraming)}
      className="grid grid-cols-2 gap-2"
    >
      {FRAMINGS.map((framing) => (
        <ToggleGroup.Item
          key={framing.id}
          value={framing.id}
          aria-label={framing.label}
          className={cx(
            "group flex flex-col items-stretch rounded-control border p-1.5",
            "transition-colors duration-100",
            "border-game-line bg-game-panel-2 text-game-ink-500 hover:border-game-line-strong hover:text-game-ink-300",
            "data-[state=on]:border-game-accent-line data-[state=on]:bg-game-accent-500/10 data-[state=on]:text-game-accent-100",
            focusRing,
          )}
        >
          <svg
            viewBox={`0 0 ${THUMB.width} ${THUMB.height}`}
            className="aspect-video w-full overflow-hidden rounded-[3px] bg-game-panel"
            aria-hidden
          >
            {/* Sea: the 2:1 world inside the 16:9 frame leaves a matte above and below. */}
            <rect
              x="0"
              y={box.top}
              width={box.width}
              height={box.height}
              className="fill-current opacity-10"
            />
            {/* The clip is applied outside the transform: on the transformed
                group it would be stretched along with the outline. */}
            <clipPath id={clipId}>
              <rect x="0" y={box.top} width={box.width} height={box.height} />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              <g
                transform={outlineTransform}
                className={cx(
                  "fill-current transition-opacity duration-100",
                  "opacity-40 group-hover:opacity-55 group-data-[state=on]:opacity-80",
                )}
              >
                <path d={WORLD_PATH} />
              </g>
            </g>
            {framing.id === "view" && frames.length > 0 && (
              <>
                <path d={veil} fillRule="evenodd" className="fill-game-panel opacity-75" />
                {frames.map((r, i) => (
                  <rect
                    key={i}
                    x={r.x}
                    y={r.y}
                    width={r.width}
                    height={r.height}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className="group-data-[state=on]:stroke-game-accent-300"
                  />
                ))}
              </>
            )}
          </svg>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
  label: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={String(value)}
      aria-label={label}
      // Radix clears the value when the pressed item is pressed again; a
      // setting always has one answer, so an empty change is ignored.
      onValueChange={(next) => {
        const match = options.find((option) => String(option.id) === next);
        if (match) onChange(match.id);
      }}
      className="flex items-center gap-px rounded-control border border-game-line bg-game-panel-2 p-px"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.id}
          value={String(option.id)}
          className={cx(
            "h-6 rounded-[3px] px-2 font-game-ui text-[11px] leading-none text-game-ink-500",
            "transition-colors duration-100 hover:text-game-ink-100",
            "data-[state=on]:bg-game-accent-500/15 data-[state=on]:text-game-accent-100",
            focusRing,
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export type TimelapseExportProps = {
  controller: TimelineController;
  timelapse: TimelapseProgress;
  /**
   * The world and the rectangle of it the live map shows, for the view
   * thumbnail. Null until the game has read it.
   */
  mapViewport: MapViewport | null;
  /**
   * Called as the panel opens and closes. A game whose map does not report
   * its viewport as it moves reads it here, when the thumbnail is about to
   * be seen.
   */
  onOpenChange?: (open: boolean) => void;
  /** The film's file name, without its extension. */
  fileName: string;
  /** How the shared world outline maps onto this game's map. */
  world: WorldSilhouette;
  /**
   * Record the film. Resolves to null when the export was stopped. The game
   * drives its own dates and frames; the panel only asks and reports.
   */
  record: (options: TimelapseOptions) => Promise<TimelapseFile | null>;
  stop: () => void;
};

/**
 * Export the campaign as a video, from the end of the timeline bar.
 *
 * The button opens a panel that states what the film will be — how long it
 * runs and how large the file lands — before a minute of encoding is spent on
 * it. The pace is not a choice: every film is cut to about half a minute, the
 * length a feed plays. Once the export runs the panel is gone: the button
 * itself carries the progress, and pressing it again stops the export.
 */
export function TimelapseExport({
  controller,
  timelapse,
  mapViewport,
  onOpenChange,
  fileName,
  world,
  record,
  stop,
}: TimelapseExportProps) {
  const [open, setOpenState] = useState(false);
  const [supported] = useState(isTimelapseSupported);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  const { totalDays } = controller;
  const [options, setOptions] = useState<TimelapseOptions>({
    framing: "world",
    quality: "1080p",
  });

  const progress = timelapse.frames === 0 ? 0 : timelapse.frame / timelapse.frames;
  const percent = Math.round(progress * 100);

  const onRecord = async () => {
    setOpen(false);
    emitEvent({
      kind: "Timelapse recording",
      view: options.framing === "world" ? "World" : "Viewport",
    });

    try {
      const result = await record(options);
      if (result === null) {
        toast.info("Export stopped", { duration: 2000 });
        return;
      }
      downloadData(result.blob, `${fileName}.${result.extension}`);
      toast.success(`Video saved · ${formatFileSize(result.blob.size)}`, { duration: 3000 });
    } catch (error) {
      captureException(error);
      toast.error("Video export failed", {
        description: getErrorMessage(error),
        duration: Infinity,
        closeButton: true,
      });
    }
  };

  const buttonClass = cx(
    "grid h-7 w-7 shrink-0 place-items-center rounded-control border transition-colors duration-100",
    "disabled:cursor-not-allowed disabled:opacity-40",
    focusRing,
  );

  if (timelapse.status !== "idle") {
    const encoding = timelapse.status === "encoding";
    return (
      <>
        <TimelapseAnnouncer status={timelapse.status} />
        <Tooltip>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              disabled={encoding}
              aria-label={
                encoding ? "Writing the video file" : `Stop the export, ${percent} percent done`
              }
              onClick={stop}
              className={cx(
                buttonClass,
                "border-game-accent-line bg-game-accent-500/15 text-game-accent-100",
                "enabled:hover:bg-game-accent-500/25",
              )}
            >
              <ProgressRing progress={progress} encoding={encoding} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content side="top" className="font-game-ui text-xs">
            {encoding ? (
              <span>Writing the video file</span>
            ) : (
              <>
                <span>Stop the export</span>
                <span className="ml-2 font-game-num text-[10px] text-game-ink-300 tabular-nums">
                  {percent}%
                </span>
              </>
            )}
          </Tooltip.Content>
        </Tooltip>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TimelapseAnnouncer status={timelapse.status} />
      <Tooltip>
        <Tooltip.Trigger asChild>
          {/* The popover trigger, wrapped so a disabled button still tells
              the pointer why. */}
          <span className="flex">
            <Popover.Trigger asChild>
              <button
                type="button"
                disabled={!supported}
                aria-label="Export timelapse video"
                className={cx(
                  buttonClass,
                  "border-game-line-strong bg-game-panel-2 text-game-ink-300",
                  "enabled:hover:border-game-accent-line enabled:hover:text-game-ink-100",
                )}
              >
                <VideoCameraIcon className="h-4 w-4" />
              </button>
            </Popover.Trigger>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content side="top" className="max-w-56 font-game-ui text-xs">
          {supported
            ? "Export timelapse video"
            : "This browser cannot encode video. Chrome and Edge can export a timelapse."}
        </Tooltip.Content>
      </Tooltip>

      <Popover.Content
        side="top"
        align="end"
        sideOffset={12}
        collisionPadding={16}
        className="w-72 rounded-panel border border-game-line-strong bg-game-panel/95 p-4 font-game-ui shadow-2xl backdrop-blur-xl"
      >
        <SectionTitle>Export video</SectionTitle>

        <FramingPicker
          value={options.framing}
          onChange={(framing) => setOptions((o) => ({ ...o, framing }))}
          mapViewport={mapViewport}
          world={world}
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-game-num text-[9.5px] font-medium tracking-[0.2em] text-game-ink-500 uppercase">
            Resolution
          </span>
          <Segmented
            label="Resolution"
            value={options.quality}
            options={TIMELAPSE_QUALITIES.map((q) => ({ id: q.id, label: q.label }))}
            onChange={(quality) => setOptions((o) => ({ ...o, quality }))}
          />
        </div>

        <ExportFacts totalDays={totalDays} options={options} />

        <GameButton variant="commit" className="mt-3.5 h-8 w-full" onClick={onRecord}>
          Export video
        </GameButton>
      </Popover.Content>
    </Popover>
  );
}

function ExportFacts({ totalDays, options }: { totalDays: number; options: TimelapseOptions }) {
  const plan = timelapsePlan({ totalDays, options });
  return (
    <p className="mt-3.5 flex items-baseline gap-1.5 border-t border-game-line pt-2.5 font-game-num text-[11px] text-game-ink-300 tabular-nums">
      <span>{formatCampaignSpan(totalDays)}</span>
      <span className="text-game-ink-700">·</span>
      <span className="text-game-ink-100">{formatDuration(plan.seconds)}</span>
      <span className="text-game-ink-700">·</span>
      <span>≈{formatFileSize(plan.bytes)}</span>
    </p>
  );
}

/**
 * Tells assistive tech what the export is doing, the way the timeline bar
 * announces the end of playback. Keyed to the stage, not the frame: a count
 * read aloud thirty times a second is noise.
 */
function TimelapseAnnouncer({ status }: { status: TimelapseStatus }) {
  const message =
    status === "recording"
      ? "Recording the video."
      : status === "encoding"
        ? "Writing the video file."
        : "";
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

/**
 * The export's progress, drawn around the bar button. While the file is
 * written there is no progress to report, so the full ring breathes instead
 * of claiming to advance.
 */
function ProgressRing({ progress, encoding }: { progress: number; encoding: boolean }) {
  const RADIUS = 7;
  const circumference = 2 * Math.PI * RADIUS;
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4 -rotate-90" aria-hidden>
      <circle
        cx="9"
        cy="9"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <circle
        cx="9"
        cy="9"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - (encoding ? 1 : progress))}
        className={cx(styles.ring, encoding && styles.ringPulse)}
      />
      {/* A stop square in the ring: the button's second job. */}
      {!encoding && <rect x="6.5" y="6.5" width="5" height="5" rx="1" fill="currentColor" />}
    </svg>
  );
}
