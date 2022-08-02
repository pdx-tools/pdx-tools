import React, { useCallback } from "react";
import { Menu } from "antd";
import { downloadData } from "@/lib/downloadData";
import { useSelector } from "react-redux";
import {
  selectEu4MapColorPayload,
  selectEu4MapDecorativeSettings,
  useEu4Meta,
} from "@/features/eu4/eu4Slice";
import { provinceIdToColorIndexInvert } from "@/features/eu4/features/map/resources";
import { selectIsDeveloper } from "@/features/account";
import {
  useCanvasRef,
  useEu4CanvasRef,
  useWasmWorker,
} from "@/features/engine";

type Items = React.ComponentProps<typeof Menu>["items"];

interface MapExportMenuProps {
  setIsExporting: (arg: boolean) => void;
}

export const MapExportMenu = ({ setIsExporting }: MapExportMenuProps) => {
  const decorativeSettings = useSelector(selectEu4MapDecorativeSettings);
  const mapColorPayload = useSelector(selectEu4MapColorPayload);
  const meta = useEu4Meta();
  const eu4CanvasRef = useEu4CanvasRef();
  const canvasRef = useCanvasRef();
  const isDeveloper = useSelector(selectIsDeveloper);
  const workerRef = useWasmWorker();
  const colorCb = useCallback(async () => {
    const worker = workerRef.current?.worker;
    if (!worker) {
      return;
    }

    const [primary, _] = await worker.eu4MapColors(mapColorPayload);
    downloadData(new Uint8Array(primary.buffer), "color-data.bin");
  }, [workerRef, mapColorPayload]);

  const indicesCb = useCallback(async () => {
    const worker = workerRef.current?.worker;
    if (!worker) {
      return;
    }

    const provinceIdToColorIndex = await worker.eu4GetProvinceIdToColorIndex();
    const colorIndexToProvinceId = provinceIdToColorIndexInvert(
      provinceIdToColorIndex
    );
    downloadData(colorIndexToProvinceId, "color-index.bin");
  }, [workerRef]);

  if (!eu4CanvasRef.current || !canvasRef.current) {
    return null;
  }

  const canvas = canvasRef.current;
  const map = eu4CanvasRef.current;
  const exportType = decorativeSettings.showTerrain ? "webp" : "png";

  const downloadDataFile = (data: Blob | null, suffix: string) => {
    if (!data) {
      return;
    }

    let outName = meta.save_game.replace(".eu4", "");
    outName = `${outName}-${meta.date}-${mapColorPayload.kind}-${suffix}.${exportType}`;

    downloadData(data, outName);
    setIsExporting(false);
  };

  const exportView = () => {
    map.map?.redrawMapNow();
    setIsExporting(true);
    canvas.toBlob((b) => downloadDataFile(b, "view"));
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
