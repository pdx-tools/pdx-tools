import { MixerHorizontalIcon } from "@/components/icons/MixerHorizontalIcon";
import { Popover } from "@/components/Popover";
import { CountryFilterButton } from "../../../components/CountryFilterButton";
import { ExportMenu } from "../../settings/ExportMenu";
import { ToggleRow } from "../../settings/ToggleRow";
import {
  useEu4Actions,
  useEu4MapMode,
  useMapShowStripes,
  usePaintSubjectInOverlordHue,
  useShowCountryBorders,
  useShowMapModeBorders,
  useShowProvinceBorders,
  useTerrainOverlay,
} from "../../../store";
import { GameButton } from "@/components/game/Button";

export function MapSettingsControl() {
  const actions = useEu4Actions();
  const mode = useEu4MapMode();
  const terrain = useTerrainOverlay();
  const stripes = useMapShowStripes();
  const subjectHue = usePaintSubjectInOverlordHue();
  const provinceBorders = useShowProvinceBorders();
  const countryBorders = useShowCountryBorders();
  const mapModeBorders = useShowMapModeBorders();

  return (
    <Popover>
      <Popover.Trigger asChild>
        <GameButton variant="icon" aria-label="Map settings">
          <MixerHorizontalIcon className="h-4 w-4" />
        </GameButton>
      </Popover.Trigger>
      <Popover.Content
        side="top"
        sideOffset={10}
        className="w-72 rounded-panel border border-game-line-strong bg-game-panel p-4 text-game-ink-100 shadow-xl"
      >
        <div className="mb-3 flex items-center">
          <h2 className="grow text-sm font-semibold">Map settings</h2>
          <CountryFilterButton />
          <ExportMenu />
        </div>
        <div className="flex flex-col gap-2">
          <ToggleRow
            value={terrain}
            onChange={actions.setTerrainOverlay}
            text="Overlay terrain textures"
          />
          <ToggleRow
            value={stripes}
            onChange={actions.setMapShowStripes}
            text="Paint map mode stripes"
          />
          <ToggleRow
            value={subjectHue}
            onChange={actions.setPaintSubjectInOverlordHue}
            text="Paint subjects in overlord hue"
            disabled={mode !== "political"}
          />
          <ToggleRow
            value={provinceBorders}
            onChange={actions.setShowProvinceBorders}
            text="Paint province borders"
          />
          <ToggleRow
            value={countryBorders}
            onChange={actions.setShowCountryBorders}
            text="Paint country borders"
          />
          <ToggleRow
            value={mapModeBorders}
            onChange={actions.setShowMapModeBorders}
            text="Paint map mode borders"
          />
        </div>
      </Popover.Content>
    </Popover>
  );
}
