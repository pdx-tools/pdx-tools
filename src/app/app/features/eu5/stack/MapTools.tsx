import { cx } from "class-variance-authority";
import { useCallback, useEffect, useRef } from "react";
import CheckIcon from "@heroicons/react/16/solid/CheckIcon";
import CameraIcon from "@heroicons/react/24/outline/CameraIcon";
import ViewfinderCircleIcon from "@heroicons/react/24/outline/ViewfinderCircleIcon";
import { focusRing } from "@/components/game/focusRing";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { Tooltip } from "@/components/Tooltip";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { isTypingTarget } from "@/features/timeline/controller";
import { downloadData } from "@/lib/downloadData";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { toast } from "@/lib/toast";
import { useMapHistory } from "../history/context";
import {
  useEu5Engine,
  useEu5IsGeneratingScreenshot,
  useEu5MapMode,
  useEu5OwnerBorders,
  useEu5PlaythroughName,
  useEu5SelectionState,
  useEu5TimelineMapDate,
} from "../store";
import { useViewportInsets } from "../useViewportInsets";

const tool = cx(
  "grid h-7 w-7 shrink-0 place-items-center rounded-control text-game-ink-500 transition-colors hover:bg-game-panel-hover hover:text-game-ink-100 disabled:cursor-not-allowed disabled:opacity-40 max-md:h-11 max-md:w-11",
  focusRing,
);

/**
 * Owner borders, as a toggle with a short label beside the camera. An icon alone
 * did not say what it does. It changes the map, so it is with the map's tools.
 * It has a checkbox, because it stays on most of the time: a filled button that is
 * always on reads as a badge. On a phone it is an item of the ⋯ menu. The "B" key toggles it.
 */
export function OwnerBordersToggle() {
  const engine = useEu5Engine();
  const on = useEu5OwnerBorders();
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label="Owner borders"
          aria-pressed={on}
          onClick={() => void engine.trigger.toggleOwnerBorders()}
          className={cx(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-control px-1.5 font-game-ui text-[12px] leading-none text-game-ink-100 transition-colors hover:bg-game-panel-hover max-md:hidden",
            focusRing,
          )}
        >
          <span
            aria-hidden
            className={cx(
              "grid h-3 w-3 place-items-center rounded-[2px] border",
              on ? "border-game-ink-100 bg-game-ink-100 text-game-page" : "border-game-ink-300",
            )}
          >
            {on ? <CheckIcon className="h-2.5 w-2.5" /> : null}
          </span>
          Borders
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content side="bottom" className="text-xs">
        Owner borders (B)
      </Tooltip.Content>
    </Tooltip>
  );
}

/** Shows the whole selection in the part of the map that the column leaves free */
export function useFrameSelection() {
  const engine = useEu5Engine();
  const latest = useViewportInsets();
  const insets = useRef(latest);
  useEffect(() => {
    insets.current = latest;
  }, [latest]);
  return useCallback(() => void engine.trigger.frameSelection(insets.current), [engine]);
}

/** Frame the selection on the map. The "F" key does the same, from anywhere but a field. */
export function FrameSelectionButton() {
  const selection = useEu5SelectionState();
  const frame = useFrameSelection();
  const none = selection == null || selection.isEmpty;

  useEffect(() => {
    if (none) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "f" && event.key !== "F") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      frame();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [frame, none]);

  // Without a selection there is nothing to frame, and a dim icon reads as a broken one.
  // The button keeps its room, so the map bar does not move when a selection appears.
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label="Frame the selection"
          onClick={frame}
          disabled={none}
          className={cx(tool, none && "invisible")}
        >
          <ViewfinderCircleIcon className="h-4 w-4" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content side="bottom" className="text-xs">
        Frame the selection (F)
      </Tooltip.Content>
    </Tooltip>
  );
}

/** The "B" key toggles the owner borders, from anywhere but a field. */
export function useOwnerBordersKey() {
  const engine = useEu5Engine();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "b" && event.key !== "B") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      void engine.trigger.toggleOwnerBorders();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine]);
}

/** Screenshot, at the end of the map row, because it captures the map */
export function ScreenshotButton() {
  const engine = useEu5Engine();
  const mapMode = useEu5MapMode();
  const generating = useEu5IsGeneratingScreenshot();
  // The screenshot is the map as it stands, which on a scrubbed timeline is
  // a past date. The file has the name of what it shows, not of the save.
  const liveDate = useEu5TimelineMapDate();
  const mapDate = useMapHistory()?.preview?.shown?.date ?? liveDate;
  const playthroughName = useEu5PlaythroughName();

  const { isLoading, run } = useTriggeredAction({
    action: async (fullResolution: boolean) => {
      try {
        const blob = await engine.trigger.generateScreenshot(fullResolution);
        const dateStr = `${mapDate.year}-${String(mapDate.month).padStart(2, "0")}-${String(mapDate.day).padStart(2, "0")}`;
        downloadData(blob, `${playthroughName}-${dateStr}-${mapMode}.png`);
        toast.success("Screenshot downloaded", { duration: 2000 });
      } catch (error) {
        toast.error("Screenshot error", { description: getErrorMessage(error), duration: 3000 });
      }
    },
  });
  const busy = isLoading || generating;

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label="Screenshot"
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={(e) => void run(e.shiftKey)}
          className={tool}
        >
          {busy ? <LoadingIcon className="h-4 w-4" /> : <CameraIcon className="h-4 w-4" />}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content side="bottom" className="text-xs">
        Screenshot · Shift-click for full resolution
      </Tooltip.Content>
    </Tooltip>
  );
}
