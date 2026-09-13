import { cx } from "class-variance-authority";
import { PauseIcon, PlayIcon } from "@heroicons/react/24/solid";
import { Tooltip } from "@/components/Tooltip";
import { GameButton } from "../components/Button";
import { focusRing } from "../components/focusRing";
import { stepUnitForModifiers } from "./useTimelineController";
import type { TimelineController } from "./useTimelineController";
import styles from "./TimelineTransport.module.css";

function TransportButton({
  label,
  hint,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  hint?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <GameButton
          variant="icon"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={className}
        >
          {children}
        </GameButton>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="font-game-ui text-xs">
        <span>{label}</span>
        {hint && <span className="ml-2 font-game-num text-[10px] text-game-ink-300">{hint}</span>}
      </Tooltip.Content>
    </Tooltip>
  );
}

/** Icons drawn to the 24px heroicons grid so they sit with the play glyph. */
function SkipStartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <rect x="5" y="5" width="2.5" height="14" rx="0.5" />
      <path d="M19 6.2v11.6a1 1 0 0 1-1.55.83L9.2 12.83a1 1 0 0 1 0-1.66l8.25-5.8A1 1 0 0 1 19 6.2Z" />
    </svg>
  );
}

function SkipEndIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <rect x="16.5" y="5" width="2.5" height="14" rx="0.5" />
      <path d="M5 6.2v11.6a1 1 0 0 0 1.55.83l8.25-5.8a1 1 0 0 0 0-1.66l-8.25-5.8A1 1 0 0 0 5 6.2Z" />
    </svg>
  );
}

function StepBackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M15.5 6.2v11.6a1 1 0 0 1-1.55.83L5.7 12.83a1 1 0 0 1 0-1.66l8.25-5.8a1 1 0 0 1 1.55.83Z" />
    </svg>
  );
}

/** Replay: an arrow that turns back on itself, offered once playback ends. */
function ReplayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5.5 12a6.5 6.5 0 1 1 1.9 4.6" />
      <path d="M5 8.5v4h4" />
    </svg>
  );
}

function StepForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8.5 6.2v11.6a1 1 0 0 0 1.55.83l8.25-5.8a1 1 0 0 0 0-1.66l-8.25-5.8a1 1 0 0 0-1.55.83Z" />
    </svg>
  );
}

/**
 * In a narrow bar the two jump buttons give way: Home and End, and the
 * readout's return button, still reach both ends.
 */
const jumpButton = "@max-xl:hidden";

export function TimelineTransport({ controller }: { controller: TimelineController }) {
  const { playing, playback, dayOffset, live, locked } = controller;
  const atStart = dayOffset <= 0;
  const ended = playback === "ended";
  const playLabel = playing ? "Pause" : ended ? "Replay from the campaign start" : "Play";

  return (
    <div className="flex items-center">
      <TransportButton
        label="Campaign start"
        hint="Home"
        onClick={controller.jumpToStart}
        disabled={locked || atStart}
        className={jumpButton}
      >
        <SkipStartIcon />
      </TransportButton>
      <TransportButton
        label="Back a day"
        hint="← · Shift month · Ctrl year"
        onClick={(event) => controller.step(stepUnitForModifiers(event), -1)}
        disabled={locked || atStart}
      >
        <StepBackIcon />
      </TransportButton>

      <Tooltip>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={playLabel}
            aria-pressed={playing}
            data-playback={playback}
            disabled={locked}
            onClick={controller.togglePlayback}
            className={cx(
              "mx-0.5 grid h-8 w-8 place-items-center rounded-full border transition-colors duration-100",
              playing
                ? "border-game-accent-500 bg-game-accent-500/20 text-game-accent-100 hover:bg-game-accent-500/30"
                : "border-game-line-strong bg-game-panel-2 text-game-ink-100 enabled:hover:border-game-accent-line enabled:hover:bg-game-panel-hover",
              "disabled:cursor-not-allowed disabled:opacity-40",
              focusRing,
            )}
          >
            {playing ? (
              <PauseIcon className="h-4 w-4" />
            ) : ended ? (
              <span className={styles.replayGlyph}>
                <ReplayIcon />
              </span>
            ) : (
              <PlayIcon className="ml-0.5 h-4 w-4" />
            )}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content side="top" className="font-game-ui text-xs">
          <span>
            {playing ? "Pause" : ended || live ? "Play from the campaign start" : "Play"}
            <span className="text-game-ink-300"> · 1 yr per second</span>
          </span>
          <span className="ml-2 font-game-num text-[10px] text-game-ink-300">Space</span>
        </Tooltip.Content>
      </Tooltip>

      <TransportButton
        label="Forward a day"
        hint="→ · Shift month · Ctrl year"
        onClick={(event) => controller.step(stepUnitForModifiers(event), 1)}
        disabled={locked || live}
      >
        <StepForwardIcon />
      </TransportButton>
      <TransportButton
        label="Save date"
        hint="End"
        onClick={controller.jumpToEnd}
        disabled={locked || live}
        className={jumpButton}
      >
        <SkipEndIcon />
      </TransportButton>
    </div>
  );
}
