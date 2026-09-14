import { useId } from "react";
import { SidebarNav } from "../components/SidebarNav";
import { useEu5Engine, useEu5MapMode, useEu5Timelapse, useEu5TimelineLive } from "../store";
import { isHistoricalMapMode } from "../ui-engine";
import { MAP_MODES } from "./modeConfig";
import type { ModeConfig } from "./modeConfig";
import type { MapMode } from "@/wasm/wasm_eu5";

export function MapModesSection() {
  const live = useEu5TimelineLive();
  // A recording drives the date from the campaign start to the save, so the
  // modes stand down until it is done rather than no-op under the pointer.
  const locked = useEu5Timelapse().status !== "idle";

  return (
    <SidebarNav aria-label="Map modes" className="border-b border-game-line">
      <SidebarNav.Section label="Map Modes">
        {MAP_MODES.map((mode) => (
          <ModeRow key={mode.value} mode={mode} live={live} locked={locked} />
        ))}
      </SidebarNav.Section>
    </SidebarNav>
  );
}

function ModeRow({ mode, live, locked }: { mode: ModeConfig; live: boolean; locked: boolean }) {
  const engine = useEu5Engine();
  const currentMapMode = useEu5MapMode();
  const isActive = currentMapMode === mode.value;
  const noteId = useId();
  // Only borders have a history. On a past date the other modes still work,
  // but choosing one returns the map to the save date first. The rows look
  // the same either way: the map's return and the timeline's exit show what
  // happened. Assistive tech gets the reason as a description.
  const resets = !live && !isHistoricalMapMode(mode.value);
  const note = locked
    ? "A timelapse recording is using the map. Map modes come back when it finishes."
    : resets
      ? `Only borders have a history. ${mode.label} shows the save date, so choosing it returns the map there.`
      : null;

  return (
    <SidebarNav.Item
      active={isActive}
      disabled={locked}
      aria-describedby={note !== null ? noteId : undefined}
      onClick={() => engine.trigger.selectMapMode(mode.value as MapMode)}
    >
      {mode.label}
      {note !== null && (
        <span id={noteId} className="sr-only">
          {note}
        </span>
      )}
    </SidebarNav.Item>
  );
}
