import React, { useCallback, useState } from "react";
import { downloadData } from "@/lib/downloadData";
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
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { provinceIdToColorIndexInvert } from "map/src/resources";
import { emitEvent } from "@/lib/events";

export const MapExportMenu = () => {
  const meta = useEu4Meta();
  const isDeveloper = useIsDeveloper();
  const map = useEu4Map();
  const terrainOverlay = useTerrainOverlay();
  const mapMode = useEu4MapMode();
  const store = useEu4Context();

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
  };

  const { isLoading: isExporting, run } = useTriggeredAction({
    action: async (type: "view" | 1 | 2 | 3) => {
      switch (type) {
        case "view": {
          const data = await map.screenshot({ kind: "viewport" });
          downloadDataFile(data, "view");
          emitEvent({ kind: "Screenshot taken", view: "Viewport" });
          break;
        }
        default: {
          const data = await map.screenshot({ kind: "world", scale: type });
          downloadDataFile(data, type == 1 ? "map" : `map-${type}x`);
          emitEvent({ kind: "Screenshot taken", view: `World (${type}:1)` });
          break;
        }
      }
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button variant="default" className="text-xs">
          {isExporting ? (
            <LoadingIcon className="mr-2 h-4 w-4 text-gray-800" />
          ) : null}
          Export
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="w-40">
        <DropdownMenu.Item asChild>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => run("view")}
          >
            Map
          </Button>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <Button variant="ghost" className="w-full" onClick={() => run(1)}>
            World (1:1)
          </Button>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <Button variant="ghost" className="w-full" onClick={() => run(2)}>
            World (2:1)
          </Button>
        </DropdownMenu.Item>
        {isDeveloper ? (
          <>
            <DropdownMenu.Item asChild>
              <Button variant="ghost" className="w-full" onClick={() => run(3)}>
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
