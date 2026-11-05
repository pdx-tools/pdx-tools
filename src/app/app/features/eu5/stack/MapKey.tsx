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
import { useRanking } from "./ModeRanking";
import { MapNamesToggle, OwnerBordersToggle } from "./MapTools";
import { useFigure } from "./figure";
import { useNameCount } from "./nameCount";
import { selectionName, selectionScalesLegend } from "./selection";

/** `GpuColor::UNOWNED` of the map */
const UNOWNED_GREY = "rgb(128, 128, 128)";

/** The space around the key. The timeline bar has the same, so their edges line up. */
const GUTTER = 16;

/** What the colours and the stripes say in a mode that has no scale */
const QUALITATIVE: Partial<Record<MapMode, { colour: string; stripes?: string }>> = {
  political: { colour: "owner", stripes: "occupier" },
  religion: { colour: "main religion", stripes: "owner's religion" },
  markets: { colour: "market" },
};

/**
 * How much of a market's colour each band of access shows. Keep in step with
 * `MARKET_ACCESS_BANDS` in eu5app.
 */
const ACCESS_BANDS = [
  { label: "<25%", strength: 0.22 },
  { label: "<50%", strength: 0.48 },
  { label: "<75%", strength: 0.74 },
  { label: "75%+", strength: 1 },
];

/** A small square of the map's stripes */
const HATCH =
  "repeating-linear-gradient(45deg, var(--game-ink-300) 0 2px, var(--game-panel) 2px 4px)";

/** The grey of land that no country owns, or in Markets that no market holds */
function NoOwnerKey({ label = "No owner" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-game-ui text-[12px] leading-tight whitespace-nowrap text-game-ink-300">
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-[1px] outline outline-game-rim"
        style={{ background: UNOWNED_GREY }}
      />
      {label}
    </span>
  );
}

/** The largest categories of a map that colours by category, as the image lists them */
function CategoryKey({ mode }: { mode: MapMode }) {
  const ranking = useRanking(mode);
  if (mode !== "religion" && mode !== "markets") return null;
  const rows = ranking?.rows.slice(0, 8) ?? [];
  if (rows.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-game-ui text-[12px] leading-tight text-game-ink-300">
      {rows.map((row) => (
        <li key={row.key} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-[1px] outline outline-game-rim"
            style={{ background: row.color }}
          />
          <span className="truncate">{row.name}</span>
        </li>
      ))}
    </ul>
  );
}

function QualitativeKey({ mode }: { mode: MapMode }) {
  const key = QUALITATIVE[mode];
  if (!key) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 font-game-ui text-[12px] leading-tight text-game-ink-300">
      <span>Colour: {key.colour}</span>
      {key.stripes ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[1px]" style={{ background: HATCH }} />
          {key.stripes}
        </span>
      ) : null}
      <NoOwnerKey label={mode === "markets" ? "No market" : "No owner"} />
    </div>
  );
}

/** The bands of market access, as the map draws them */
function AccessKey() {
  return (
    <div className="flex items-center gap-2 font-game-ui text-[12px] leading-tight text-game-ink-300">
      <span className="shrink-0">Brightness: access</span>
      {ACCESS_BANDS.map((band) => (
        <span key={band.label} className="inline-flex items-center gap-0.5 font-game-num">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[1px] outline outline-game-rim"
            style={{
              background: `color-mix(in srgb, var(--game-ink-100) ${band.strength * 100}%, rgb(20,5,5))`,
            }}
          />
          {band.label}
        </span>
      ))}
    </div>
  );
}

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
  const figure = useFigure();
  const names = useNameCount();

  return (
    <div
      role="group"
      aria-label="Map key"
      className={
        inSheet
          ? "flex items-center gap-2.5 border-b border-game-line px-3.5 pb-1.5 font-game-ui empty:hidden"
          : "pointer-events-auto absolute z-20 flex w-[380px] flex-col gap-1.5 rounded-panel border border-game-line-strong bg-game-panel px-2.5 py-2 font-game-ui shadow-lg empty:hidden"
      }
      style={
        inSheet
          ? undefined
          : {
              left: insets.left + GUTTER,
              bottom: insets.bottom + (timeline > 0 ? timeline + GUTTER : 0) + GUTTER,
            }
      }
    >
      {/* The figure's own caption. The image of the map carries the same words. */}
      {inSheet ? null : (
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] leading-snug font-medium text-balance text-game-ink-100">
              {figure.title}
            </p>
            <p className="text-[12px] leading-snug text-game-ink-300">{figure.subtitle}</p>
            {/* Off the map, so that no name prints over it. */}
            {names.shown < names.wanted ? (
              <p className="text-[12px] leading-snug text-game-ink-300">
                Names: {names.shown} of {names.wanted}. Zoom for more.
              </p>
            ) : null}
          </div>
          {/* One place in each mode. */}
          <span className="flex shrink-0 flex-col items-start">
            <MapNamesToggle />
            <OwnerBordersToggle />
          </span>
        </div>
      )}
      {/* The first row holds what the map draws, and a mode with no scale has its key here too. */}
      <div className="flex items-center gap-2 empty:hidden">
        {QUALITATIVE[mode] ? (
          <div className="min-w-0 flex-1">
            <QualitativeKey mode={mode} />
          </div>
        ) : null}
        {inSheet && parent.variants.length > 1 ? (
          <GameSegmented
            aria-label={`${parent.label} view`}
            value={mode}
            onValueChange={(value) => void engine.trigger.selectMapMode(value as MapMode)}
            disabled={locked}
            className={inSheet ? "shrink-0" : "min-w-0 shrink"}
          >
            {parent.variants.map((v) => (
              <GameSegmented.Item key={v.value} value={v.value} className="flex-1 justify-center">
                {v.label}
              </GameSegmented.Item>
            ))}
          </GameSegmented>
        ) : null}
      </div>
      {inSheet ? null : <CategoryKey mode={mode} />}
      {mode === "markets" ? <AccessKey /> : null}
      <Legend marker={marker} scope={scope} aside={inSheet ? undefined : <NoOwnerKey />} />
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
