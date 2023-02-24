import { useState } from "react";
import { Spin, Dropdown, Button, Divider } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { MapModeButtonGroup } from "../../components/map-modes";
import { CountryFilterButton } from "../country-filter";
import { DateTimeline } from "./DateTimeline";
import { MapExportMenu } from "./MapExportMenu";
import { ToggleRow } from "./ToggleRow";
import { Timelapse } from "./Timelapse";
import {
  useEu4Actions,
  useEu4MapMode,
  usePaintSubjectInOverlordHue,
  useMapShowStripes,
  useTerrainOverlay,
  useShowProvinceBorders,
  useShowCountryBorders,
  useIsCountryBordersDisabled,
  useShowMapModeBorders,
} from "../../Eu4SaveProvider";

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
  const countryBordersDisabled = useIsCountryBordersDisabled();

  return (
    <ToggleRow
      value={countryBordersDisabled ? false : data}
      onChange={setShowCountryBorders}
      text="Paint country borders"
      disabled={countryBordersDisabled}
    />
  );
};

const MapModeBordersToggleRow = () => {
  const data = useShowMapModeBorders();
  const { setShowMapModeBorders } = useEu4Actions();
  const mapMode = useEu4MapMode();
  const disabled = mapMode == "terrain" || mapMode == "political";

  return (
    <ToggleRow
      value={data}
      onChange={setShowMapModeBorders}
      text="Paint map mode borders"
      disabled={disabled}
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
      <div className="flex items-center gap-2">
        <CountryFilterButton>Filter Countries</CountryFilterButton>

        <Spin delay={50} spinning={isExporting}>
          <Dropdown overlay={<MapExportMenu setIsExporting={setIsExporting} />}>
            <Button>
              Export <DownOutlined />
            </Button>
          </Dropdown>
        </Spin>
      </div>

      <TerrainToggleRow />
      <MapStripesToggleRow />
      <PaintSubjectInOverlordHueToggleRow />
      <ProvinceBordersToggleRow />
      <CountryBordersToggleRow />
      <MapModeBordersToggleRow />

      <Divider orientation="left">Date Controls</Divider>
      <DateTimeline />

      <Divider orientation="left">Timelapse</Divider>
      <Timelapse />
    </>
  );
};
