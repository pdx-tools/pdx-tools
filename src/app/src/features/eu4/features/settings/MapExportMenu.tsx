import React, { useCallback, useState } from "react";
import { downloadData } from "@/lib/downloadData";
import { provinceIdToColorIndexInvert } from "@/features/eu4/features/map/resources";
import { useIsDeveloper } from "@/features/account";
import { getEu4Worker } from "../../worker";
import {
  selectMapPayload,
  useEu4Context,
  useEu4Map,
  useEu4MapMode,
  useEu4Meta,
  useTerrainOverlay,
} from "../../store";
import { DropdownMenu } from "@/components/DropdownMenu";
import { Button } from "@/components/Button";
import { LoadingIcon } from "@/components/icons/LoadingIcon";

export const MapExportMenu = () => {
  const meta = useEu4Meta();
  const isDeveloper = useIsDeveloper();
  const map = useEu4Map();
  const terrainOverlay = useTerrainOverlay();
  const mapMode = useEu4MapMode();
  const store = useEu4Context();
  const [isExporting, setIsExporting] = useState(false);

  const colorCb = useCallback(async () => {
    const mapPayload = selectMapPayload(store.getState());
    const { primary } = await getEu4Worker().eu4MapColors(mapPayload);
    downloadData(new Uint8Array(primary.buffer), "color-data.bin");
  }, [store]);

  const indicesCb = useCallback(async () => {
    const provinceIdToColorIndex =
      await getEu4Worker().eu4GetProvinceIdToColorIndex();
    const colorIndexToProvinceId = provinceIdToColorIndexInvert(
      provinceIdToColorIndex,
    );
    downloadData(colorIndexToProvinceId, "color-index.bin");
  }, []);

  const exportType = terrainOverlay ? "webp" : "png";

  const downloadDataFile = (data: Blob | null, suffix: string) => {
    if (!data) {
      return;
    }

    let outName = meta.save_game.replace(".eu4", "");
    outName = `${outName}-${meta.date}-${mapMode}-${suffix}.${exportType}`;

    downloadData(data, outName);
    setIsExporting(false);
  };

  const exportView = () => {
    map.redrawMapNow();
    setIsExporting(true);
    map.gl.canvas.toBlob((b) => downloadDataFile(b, "view"));
  };

  const exportFullView = async () => {
    setIsExporting(true);
    const data = await map.mapData(1, `image/${exportType}`);
    downloadDataFile(data, "map");
  };

  const exportFullView2x = async () => {
    setIsExporting(true);
    const data = await map.mapData(2, `image/${exportType}`);
    downloadDataFile(data, "map-2x");
  };

  const exportFullView3x = async () => {
    setIsExporting(true);
    const data = await map.mapData(3, `image/${exportType}`);
    downloadDataFile(data, "map-3x");
  };

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button variant="default" className="text-xs">
          {isExporting ? (
            <LoadingIcon className="h-4 w-4 text-gray-800 mr-2" />
          ) : null}
          Export
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="w-40">
        <DropdownMenu.Item asChild>
          <Button variant="ghost" className="w-full" onClick={exportView}>
            Map
          </Button>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <Button variant="ghost" className="w-full" onClick={exportFullView}>
            World (1:1)
          </Button>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <Button variant="ghost" className="w-full" onClick={exportFullView2x}>
            World (2:1)
          </Button>
        </DropdownMenu.Item>
        {isDeveloper ? (
          <>
            <DropdownMenu.Item asChild>
              <Button
                variant="ghost"
                className="w-full"
                onClick={exportFullView3x}
              >
                World (3x)
              </Button>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Button variant="ghost" className="w-full" onClick={colorCb}>
                Color Data
              </Button>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Button variant="ghost" className="w-full" onClick={indicesCb}>
                Index Data
              </Button>
            </DropdownMenu.Item>
          </>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
