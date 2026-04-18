import { cx } from "class-variance-authority";
import { useEu5Engine, useEu5MapMode } from "../store";
import { MAP_MODES } from "./modeConfig";
import type { ModeConfig } from "./modeConfig";
import type { MapMode } from "@/wasm/wasm_eu5";

export function MapModesSection() {
  return (
    <section className="flex flex-col overflow-hidden border-b border-eu5-line">
      <div className="flex h-9 shrink-0 items-center px-3.5">
        <h3 className="font-mono text-[9.5px] font-medium tracking-[0.28em] text-eu5-ink-500 uppercase">
          Map Modes
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {MAP_MODES.map((mode) => (
          <ModeRow key={mode.value} mode={mode} />
        ))}
      </div>
    </section>
  );
}

function ModeRow({ mode }: { mode: ModeConfig }) {
  const engine = useEu5Engine();
  const currentMapMode = useEu5MapMode();
  const isActive = currentMapMode === mode.value;

  return (
    <button
      type="button"
      onClick={() => engine.trigger.selectMapMode(mode.value as MapMode)}
      className={cx(
        "relative flex h-7 w-full items-center pr-3.5 pl-3.5 text-left",
        "text-[12.5px] text-eu5-ink-300 transition-colors duration-100",
        "hover:bg-eu5-bg-hover hover:text-eu5-ink-100",
        isActive && "text-eu5-bronze-100",
        isActive && "bg-linear-to-r from-eu5-bronze-500/15 to-transparent",
      )}
    >
      <span
        className={cx(
          "absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full",
          isActive ? "bg-eu5-bronze-500" : "bg-transparent",
        )}
      />
      <span className={cx(isActive && "font-medium")}>{mode.label}</span>
    </button>
  );
}
