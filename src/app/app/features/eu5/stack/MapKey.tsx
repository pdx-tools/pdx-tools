import type { MapMode } from "@/wasm/wasm_eu5";
import { GameSegmented } from "../components";
import { Legend } from "../control-panel/Legend";
import { parentOf } from "../control-panel/modeConfig";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import {
  useEu5Engine,
  useEu5MapMode,
  useEu5SelectionState,
  useEu5Timelapse,
  useEu5TimelineBarHeight,
} from "../store";
import { useViewportInsets } from "../useViewportInsets";
import { locationStatValue } from "./compare";
import { OwnerBordersToggle } from "./MapTools";
import { selectionName, selectionScalesLegend } from "./selection";

const GUTTER = 8;

/** What the colours and the stripes say in a mode that has no scale */
const STRIPES: Partial<Record<MapMode, string>> = {
  political: "Colour: owner. Stripes: occupier",
  markets: "Colour: market",
  religion: "Colour: main religion. Stripes: owner's religion",
};

/**
 * The key of the map, on the map: how the map draws the open mode (its variants and
 * owner borders) and how to read it (its scale).
 * It describes the map and not the open level, so it stays at each level, and the
 * reader can always read the colours. It stands clear of the column and the timeline.
 */
export function MapKey({ inSheet = false }: { inSheet?: boolean }) {
  const mode = useEu5MapMode();
  const engine = useEu5Engine();
  const selection = useEu5SelectionState();
  const locked = useEu5Timelapse().status !== "idle";
  const insets = useViewportInsets();
  const timeline = useEu5TimelineBarHeight();
  const parent = parentOf(mode);
  const scope =
    selection && !selection.isEmpty && selectionScalesLegend(mode)
      ? selectionName(selection)
      : undefined;
  const profile = selection?.preset === "players" ? undefined : selection?.activeProfile;
  const locationIdx = profile?.kind === "location" ? profile.location.key : null;
  const marker = useLocationMarker(locationIdx, mode);

  return (
    <div
      role="group"
      aria-label="Map key"
      className={
        inSheet
          ? "flex items-center gap-2.5 border-b border-game-line px-3.5 pb-1.5 font-game-ui empty:hidden"
          : "pointer-events-auto absolute z-20 flex w-[280px] flex-col gap-1.5 rounded-panel border border-game-line-strong bg-game-panel px-2.5 py-2 font-game-ui shadow-lg empty:hidden"
      }
      style={
        inSheet
          ? undefined
          : { left: insets.left + GUTTER, bottom: insets.bottom + timeline + GUTTER }
      }
    >
      <div className="flex items-center gap-2 empty:hidden">
        {parent.variants.length > 1 ? (
          <GameSegmented
            aria-label={`${parent.label} view`}
            value={mode}
            onValueChange={(value) => void engine.trigger.selectMapMode(value as MapMode)}
            disabled={locked}
            className={inSheet ? "shrink-0" : "min-w-0 flex-1"}
          >
            {parent.variants.map((v) => (
              <GameSegmented.Item key={v.value} value={v.value} className="flex-1 justify-center">
                {v.label}
              </GameSegmented.Item>
            ))}
          </GameSegmented>
        ) : null}
        {inSheet ? null : (
          <span className="ml-auto">
            <OwnerBordersToggle />
          </span>
        )}
      </div>
      <Legend marker={marker} scope={scope} />
      {STRIPES[mode] ? (
        <p className="min-w-0 font-game-ui text-[12px] leading-tight text-game-ink-300">
          {STRIPES[mode]}
        </p>
      ) : null}
    </div>
  );
}

/** The selected location's value in the mode, as a mark on the scale */
function useLocationMarker(locationIdx: number | null, mode: MapMode): number | undefined {
  const { data } = useEu5Trigger(
    async (engine) =>
      locationIdx === null ? null : await engine.queries.getLocationProfile(locationIdx),
    [locationIdx],
  );
  if (!data) return undefined;
  const levels = data.buildings.reduce((sum, b) => sum + b.level, 0);
  return locationStatValue(data.stats, levels, mode);
}
