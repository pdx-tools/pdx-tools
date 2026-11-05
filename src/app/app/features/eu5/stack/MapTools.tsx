import { cx } from "class-variance-authority";
import { useEffect } from "react";
import CheckIcon from "@heroicons/react/16/solid/CheckIcon";
import GlobeAltIcon from "@heroicons/react/24/outline/GlobeAltIcon";
import ViewfinderCircleIcon from "@heroicons/react/24/outline/ViewfinderCircleIcon";
import { focusRing } from "@/components/game/focusRing";
import { Tooltip } from "@/components/Tooltip";
import { isTypingTarget } from "@/features/timeline/controller";
import {
  useEu5Engine,
  useEu5MapViewport,
  useEu5OwnerBorders,
  useEu5SelectionState,
} from "../store";
import { useFrameSelection } from "./frameSelection";
import { useMapNames } from "./MapLabels";

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

/** The names on the map, on or off. It reads as the Borders toggle does. */
export function MapNamesToggle() {
  const [on, toggle] = useMapNames();
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label="Names on the map"
          aria-pressed={on}
          onClick={toggle}
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
          Names
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content side="bottom" className="text-xs">
        Names on the map (N)
      </Tooltip.Content>
    </Tooltip>
  );
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

/** Show the whole world again. The "0" key does the same, from anywhere but a field. */
export function WorldViewButton() {
  const engine = useEu5Engine();
  const viewport = useEu5MapViewport();
  const world = viewport?.world;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "0" || isTypingTarget(event.target) || !world) return;
      event.preventDefault();
      void engine.trigger.fitWorldRect({ x: 0, y: 0, width: world.width, height: world.height });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, world]);
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label="Whole world"
          disabled={!world}
          onClick={() =>
            world &&
            void engine.trigger.fitWorldRect({
              x: 0,
              y: 0,
              width: world.width,
              height: world.height,
            })
          }
          className={tool}
        >
          <GlobeAltIcon className="h-4 w-4" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content side="bottom" className="text-xs">
        Whole world (0)
      </Tooltip.Content>
    </Tooltip>
  );
}
