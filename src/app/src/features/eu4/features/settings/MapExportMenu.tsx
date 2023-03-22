import React, { useCallback } from "react";
import { Menu } from "antd";
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

type Items = React.ComponentProps<typeof Menu>["items"];

interface MapExportMenuProps {
  setIsExporting: (arg: boolean) => void;
}

export const MapExportMenu = ({ setIsExporting }: MapExportMenuProps) => {
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
      provinceIdToColorIndex
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

  const items: Items = [
    { key: "1", onClick: exportView, label: "View" },
    { key: "2", onClick: exportFullView, label: "World" },
    { key: "3", onClick: exportFullView2x, label: "World (2x)" },
  ];

  if (isDeveloper) {
    items.push(
      ...[
        {
          key: "5",
          onClick: exportFullView3x,
          label: "World (3x)",
          className: "bg-amber-200",
        },
        {
          key: "6",
          onClick: colorCb,
          label: "Color Data",
          className: "bg-amber-200",
        },
        {
          key: "7",
          onClick: indicesCb,
          label: "Index Data",
          className: "bg-amber-200",
        },
      ]
    );
  }

  return <Menu items={items}></Menu>;
};
