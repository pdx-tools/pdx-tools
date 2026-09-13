import { useId } from "react";
import { cx } from "class-variance-authority";
import { focusRingInset } from "../components/focusRing";
import { useEu5Engine, useEu5MapMode, useEu5TimelineLive } from "../store";
import { isHistoricalMapMode } from "../ui-engine";
import { MAP_MODES } from "./modeConfig";
import type { ModeConfig } from "./modeConfig";
import type { MapMode } from "@/wasm/wasm_eu5";

export function MapModesSection() {
  const live = useEu5TimelineLive();

  return (
    <section className="flex flex-col overflow-hidden border-b border-game-line">
      <div className="flex h-9 shrink-0 items-center px-3.5">
        <h3 className="font-mono text-[9.5px] font-medium tracking-[0.28em] text-game-ink-500 uppercase">
          Map Modes
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {MAP_MODES.map((mode) => (
          <ModeRow key={mode.value} mode={mode} live={live} />
        ))}
      </div>
    </section>
  );
}

function ModeRow({ mode, live }: { mode: ModeConfig; live: boolean }) {
  const engine = useEu5Engine();
  const currentMapMode = useEu5MapMode();
  const isActive = currentMapMode === mode.value;
  const noteId = useId();
  // Only borders have a history. On a past date the other modes still work,
  // but choosing one returns the map to the save date first. The rows look
  // the same either way: the map's return and the timeline's exit show what
  // happened. Assistive tech gets the reason as a description.
  const resets = !live && !isHistoricalMapMode(mode.value);

  return (
    <button
      type="button"
      aria-describedby={resets ? noteId : undefined}
      onClick={() => engine.trigger.selectMapMode(mode.value as MapMode)}
      className={cx(
        "relative flex h-7 w-full items-center pr-3.5 pl-3.5 text-left",
        "text-[12.5px] text-game-ink-300 transition-colors duration-100",
        "hover:bg-game-panel-hover hover:text-game-ink-100",
        focusRingInset,
        isActive && "text-game-accent-100",
        isActive && "bg-linear-to-r from-game-accent-500/15 to-transparent",
      )}
    >
      <span
        className={cx(
          "absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full",
          isActive ? "bg-game-accent-500" : "bg-transparent",
        )}
      />
      <span className={cx(isActive && "font-medium")}>{mode.label}</span>
      {resets && (
        <span id={noteId} className="sr-only">
          Only borders have a history. {mode.label} shows the save date, so choosing it returns the
          map there.
        </span>
      )}
    </button>
  );
}
