import { useState } from "react";
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
import { GameButton } from "../components/Button";
import { SectionTitle } from "../components/SectionTitle";
import { focusRing } from "../components/focusRing";
import { useEu5Engine, useEu5MapViewport, useEu5PlaythroughName, useEu5Timelapse } from "../store";
import type { TimelineController } from "./useTimelineController";
import type { TimelapseStatus } from "../ui-engine";
import {
  TIMELAPSE_QUALITIES,
  formatCampaignSpan,
  formatDuration,
  formatFileSize,
  isTimelapseSupported,
  timelapsePlan,
} from "./timelapse/options";
import type { TimelapseOptions } from "./timelapse/options";
import { expandToAspect } from "./timelapseFrame";
import type { MapViewport, TimelapseFraming, WorldRect } from "./timelapseFrame";
import styles from "./TimelapseExport.module.css";

/**
 * The world, simplified to a silhouette, on a 360 by 180 equirectangular
 * grid: one degree to one unit. Recognizable at a thumbnail's size, which is
 * the only size it is drawn at.
 */
const WORLD_PATH =
  "M15 22 40 20 60 18 85 17 100 18 118 30 125 43 114 46 104 55 99 65 90 61 83 64 75 70 85 74 96 80 102 82 95 76 75 65 63 58 55 45 45 32 30 30 15 30Z M125 30 160 20 155 7 120 8 110 14 120 24Z M102 82 120 80 130 90 145 97 142 105 132 115 122 128 115 140 110 145 107 135 110 110 100 95Z M171 53 171 47 178 46 175 42 182 39 184 37 188 36 188 33 191 34 193 36 200 35 202 32 205 30 210 30 204 25 208 20 220 22 240 21 240 35 228 43 220 45 218 43 215 45 210 44 208 46 209 49 206 49 203 50 204 52 202 53 200 50 200 48 194 45 192 46 194 49 198 50 196 51 192 48 190 46 188 46 183 48 180 51 178 53Z M185 32 187 28 194 23 202 20 210 20 208 24 202 26 199 30 196 34 192 34 190 31 188 31Z M240 21 255 18 280 13 310 17 340 20 360 22 360 28 340 30 320 35 315 45 305 52 302 60 290 70 285 80 283 88 280 82 275 75 268 68 260 75 257 82 252 70 245 65 237 67 232 75 225 77 223 73 215 60 212 59 216 54 210 54 207 53 206 50 209 49 217 49 220 46 228 43 240 35Z M163 75 170 60 180 54 190 53 200 58 212 59 223 78 231 79 220 95 215 110 212 120 200 125 195 115 192 95 188 86 175 85 172 85 163 78Z M294 112 305 104 317 102 325 105 330 115 332 123 322 129 310 122 295 125Z M174 40 182 39 180 37 178 32 174 32 175 36Z M170 38 174 38 174 35 170 36Z M310 58 316 54 321 48 323 46 320 50 315 56Z M224 103 230 105 228 115 224 114Z M276 85 285 96 300 99 315 95 320 93 330 96 328 100 310 99 295 99 280 92Z";

/** The thumbnail's frame is 16:9, like the film; the 2:1 world sits inside it. */
const THUMB = { width: 360, height: 202.5 };
const WORLD = { width: 360, height: 180 };
const WORLD_TOP = (THUMB.height - WORLD.height) / 2;

const FRAMINGS: { id: TimelapseFraming; label: string }[] = [
  { id: "world", label: "Whole world" },
  { id: "view", label: "The current view of the map" },
];

/** The rectangle a recording of the current view would frame, in thumbnail units. */
function viewFrameRects(mapViewport: MapViewport): WorldRect[] {
  const { world, viewport } = mapViewport;
  const rect = expandToAspect(viewport, world, THUMB.width / THUMB.height);
  const sx = WORLD.width / world.width;
  const sy = WORLD.height / world.height;
  const scaled = {
    x: rect.x * sx,
    y: rect.y * sy + WORLD_TOP,
    width: rect.width * sx,
    height: rect.height * sy,
  };
  // The world wraps east to west, so a frame past the antimeridian is drawn
  // in two pieces.
  const overflow = scaled.x + scaled.width - WORLD.width;
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
 */
function FramingPicker({
  value,
  onChange,
  mapViewport,
}: {
  value: TimelapseFraming;
  onChange: (value: TimelapseFraming) => void;
  mapViewport: MapViewport | null;
}) {
  const frames = mapViewport ? viewFrameRects(mapViewport) : [];
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
              y={WORLD_TOP}
              width={WORLD.width}
              height={WORLD.height}
              className="fill-current opacity-10"
            />
            <path
              d={WORLD_PATH}
              transform={`translate(0 ${WORLD_TOP})`}
              className={cx(
                "fill-current transition-opacity duration-100",
                "opacity-40 group-hover:opacity-55 group-data-[state=on]:opacity-80",
              )}
            />
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

function Segmented<T extends string>({
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
      value={value}
      aria-label={label}
      // Radix clears the value when the pressed item is pressed again; a
      // setting always has one answer, so an empty change is ignored.
      onValueChange={(next) => next && onChange(next as T)}
      className="flex items-center gap-px rounded-control border border-game-line bg-game-panel-2 p-px"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.id}
          value={option.id}
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

/**
 * Export the campaign as a video, from the end of the timeline bar.
 *
 * The button opens a panel that states what the film will be — how long it
 * runs and how large the file lands — before a minute of encoding is spent on
 * it. The pace is not a choice: every film is cut to about half a minute, the
 * length a feed plays. Once the export runs the panel is gone: the button
 * itself carries the progress, and pressing it again stops the export.
 */
export function TimelapseExport({ controller }: { controller: TimelineController }) {
  const engine = useEu5Engine();
  const timelapse = useEu5Timelapse();
  const playthroughName = useEu5PlaythroughName();
  const [open, setOpen] = useState(false);
  const [supported] = useState(isTimelapseSupported);
  // The view thumbnail follows the map: the worker reports where it is
  // looking on the frames that change, so a zoom under the open panel
  // tightens the frame as it happens.
  const mapViewport = useEu5MapViewport();

  const { timeline, totalDays } = controller;
  const [options, setOptions] = useState<TimelapseOptions>({
    framing: "world",
    quality: "1080p",
  });

  const progress = timelapse.frames === 0 ? 0 : timelapse.frame / timelapse.frames;
  const percent = Math.round(progress * 100);

  const record = async () => {
    setOpen(false);
    emitEvent({
      kind: "Timelapse recording",
      view: options.framing === "world" ? "World" : "Viewport",
    });

    try {
      const result = await engine.trigger.recordTimelapse(options);
      if (result === null) {
        toast.info("Export stopped", { duration: 2000 });
        return;
      }
      const name = `${playthroughName}-timelapse-${timeline.start.year}-${timeline.end.year}`;
      downloadData(result.blob, `${name}.${result.extension}`);
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
              onClick={() => engine.trigger.stopTimelapse()}
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

        <GameButton variant="commit" className="mt-3.5 h-8 w-full" onClick={record}>
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
