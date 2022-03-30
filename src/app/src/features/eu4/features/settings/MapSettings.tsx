import { useState } from "react";
import { Spin, Dropdown, Button, Divider } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import { useAppDispatch } from "@/lib/store";
import {
  selectEu4MapColorPayload,
  selectEu4MapDecorativeSettings,
  selectEu4MapMode,
  selectEu4CountryBordersDisabled,
  toggleShowTerrain,
  toggleShowController,
  togglePaintSubjectInOverlordHue,
  toggleShowProvinceBorders,
  toggleShowCountryBorders,
  toggleShowMapModeBorders,
} from "@/features/eu4/eu4Slice";
import { MapModeButtonGroup } from "../../components/map-modes";
import { CountryFilterButton } from "../country-filter";
import { DateTimeline } from "./DateTimeline";
import { MapExportMenu } from "./MapExportMenu";
import { ToggleRow } from "./ToggleRow";
import { Timelapse } from "./Timelapse";

export const MapSettings: React.FC<{}> = () => {
  const [isExporting, setIsExporting] = useState(false);
  const dispatch = useAppDispatch();
  const mapControl = useSelector(selectEu4MapColorPayload);
  const decorativeMap = useSelector(selectEu4MapDecorativeSettings);
  const mapMode = useSelector(selectEu4MapMode);

  const overlordHueDisabled = mapMode != "political";
  const showStripesDisabled = mapMode == "terrain";
  const mapModeBordersDisabled = mapMode == "terrain" || mapMode == "political";
  const countryBordersDisabled = useSelector(selectEu4CountryBordersDisabled);

  return (
    <>
      <div>
        <MapModeButtonGroup />
      </div>
      <div className="flex-row gap">
        <CountryFilterButton>Filter Countries</CountryFilterButton>

        <Spin delay={50} spinning={isExporting}>
          <Dropdown overlay={<MapExportMenu setIsExporting={setIsExporting} />}>
            <Button>
              Export <DownOutlined />
            </Button>
          </Dropdown>
        </Spin>
      </div>

      <ToggleRow
        value={decorativeMap.showTerrain}
        onChange={(e) => {
          dispatch(toggleShowTerrain(e));
          localStorage.setItem("map-show-terrain", JSON.stringify(e));
        }}
        text="Overlay terrain textures"
      />

      <ToggleRow
        value={mapControl.showSecondaryColor}
        onChange={(e) => dispatch(toggleShowController(e))}
        text="Paint map mode stripes"
        disabled={showStripesDisabled}
      />

      <ToggleRow
        value={mapControl.paintSubjectInOverlordHue}
        onChange={(e) => dispatch(togglePaintSubjectInOverlordHue(e))}
        text="Paint subjects in overlord hue"
        disabled={overlordHueDisabled}
      />

      <ToggleRow
        value={decorativeMap.showProvinceBorders}
        onChange={(e) => dispatch(toggleShowProvinceBorders(e))}
        text="Paint province borders"
      />

      <ToggleRow
        value={decorativeMap.showCountryBorders}
        onChange={(e) => dispatch(toggleShowCountryBorders(e))}
        text="Paint country borders"
        disabled={countryBordersDisabled}
      />

      <ToggleRow
        value={decorativeMap.showMapModeBorders}
        onChange={(e) => dispatch(toggleShowMapModeBorders(e))}
        disabled={mapModeBordersDisabled}
        text="Paint map mode borders"
      />

      <Divider orientation="left">Date Controls</Divider>
      <DateTimeline />

      <Divider orientation="left">Timelapse</Divider>
      <Timelapse />
    </>
  );
};
