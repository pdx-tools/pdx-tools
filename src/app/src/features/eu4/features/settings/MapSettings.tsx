import { useState } from "react";
import { MapModeButtonGroup } from "../../components/map-modes";
import { DateTimeline } from "./DateTimeline";
import { MapExportMenu } from "./MapExportMenu";
import { ToggleRow } from "./ToggleRow";
import { Timelapse } from "./Timelapse";
import { Button } from "@/components/Button";
import {
  useEu4Actions,
  useEu4MapMode,
  usePaintSubjectInOverlordHue,
  useMapShowStripes,
  useTerrainOverlay,
  useShowProvinceBorders,
  useShowCountryBorders,
  useShowMapModeBorders,
} from "../../store";
import { Divider } from "@/components/Divider";
import { DropdownMenu } from "@/components/DropdownMenu";
import { CountryFilterButton } from "../../components/CountryFilterButton";

const TerrainToggleRow = () => {
  const data = useTerrainOverlay();
  const { setTerrainOverlay } = useEu4Actions();
  return (
    <ToggleRow
      value={data}
      onChange={setTerrainOverlay}
      text="Overlay terrain textures"
    />
  );
};

const MapStripesToggleRow = () => {
  const data = useMapShowStripes();
  const { setMapShowStripes } = useEu4Actions();
  return (
    <ToggleRow
      value={data}
      onChange={setMapShowStripes}
      text="Paint map mode stripes"
    />
  );
};

const PaintSubjectInOverlordHueToggleRow = () => {
  const data = usePaintSubjectInOverlordHue();
  const { setPaintSubjectInOverlordHue } = useEu4Actions();
  const mapMode = useEu4MapMode();
  const overlordHueDisabled = mapMode != "political";

  return (
    <ToggleRow
      value={data}
      onChange={setPaintSubjectInOverlordHue}
      text="Paint subjects in overlord hue"
      disabled={overlordHueDisabled}
    />
  );
};

const ProvinceBordersToggleRow = () => {
  const data = useShowProvinceBorders();
  const { setShowProvinceBorders } = useEu4Actions();
  return (
    <ToggleRow
      value={data}
      onChange={setShowProvinceBorders}
      text="Paint province borders"
    />
  );
};

const CountryBordersToggleRow = () => {
  const data = useShowCountryBorders();
  const { setShowCountryBorders } = useEu4Actions();

  return (
    <ToggleRow
      value={data}
      onChange={setShowCountryBorders}
      text="Paint country borders"
    />
  );
};

const MapModeBordersToggleRow = () => {
  const data = useShowMapModeBorders();
  const { setShowMapModeBorders } = useEu4Actions();

  return (
    <ToggleRow
      value={data}
      onChange={setShowMapModeBorders}
      text="Paint map mode borders"
    />
  );
};

export const MapSettings = () => {
  const [isExporting, setIsExporting] = useState(false);

  return (
    <>
      <div>
        <MapModeButtonGroup />
      </div>
      <div className="flex items-center gap-3">
        <CountryFilterButton />

        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button variant="default">Export</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <MapExportMenu setIsExporting={setIsExporting} />
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>

      <TerrainToggleRow />
      <MapStripesToggleRow />
      <PaintSubjectInOverlordHueToggleRow />
      <ProvinceBordersToggleRow />
      <CountryBordersToggleRow />
      <MapModeBordersToggleRow />

      <Divider>Date Controls</Divider>
      <DateTimeline />

      <Divider>Timelapse</Divider>
      <Timelapse />
    </>
  );
};
