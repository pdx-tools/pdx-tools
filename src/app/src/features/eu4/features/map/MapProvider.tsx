import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { check } from "@/lib/isPresent";
import { IMG_HEIGHT, IMG_WIDTH, WebGLMap } from "@/map/map";
import { createContext } from "react";
import { useEu4Save } from "../../Eu4SaveProvider";
import { useCanvasPointerEvents } from "../../hooks/useCanvasPointerEvents";
import { loadTerrainOverlayImages } from "./resources";

type MapProviderProps = {
  children: React.ReactNode;
};

const MapContext = createContext<{ map: WebGLMap } | undefined>(undefined);
export const MapProvider = ({ children }: MapProviderProps) => {
  const map = useEu4Save((x) => x.map);
  useCanvasPointerEvents(map);
  return <MapContext.Provider value={{ map }}>{children}</MapContext.Provider>;
};

type FocusCameraOnProps = {
  offsetX: number;
  width: number;
  height: number;
};

export function focusCameraOn(
  map: WebGLMap,
  [x, y]: number[],
  options?: Partial<FocusCameraOnProps>
) {
  const width = options?.width ?? map.gl.canvas.width;
  const height = options?.height ?? map.gl.canvas.height;

  const IMG_ASPECT = IMG_WIDTH / IMG_HEIGHT;
  const initX = ((x - IMG_WIDTH / 2) / (IMG_WIDTH / 2)) * (width / 2);
  const initY =
    (((y - IMG_HEIGHT / 2) / (IMG_HEIGHT / 2)) * (height / 2)) /
    (IMG_ASPECT / (width / height));

  map.focusPoint = [initX, initY];

  if (options?.offsetX) {
    map.focusPoint[0] = initX + options.offsetX / 2 / map.scale;
  }
}

export async function loadTerrainImages(map: WebGLMap, version: string) {
  const images = await loadTerrainOverlayImages(version);
  map.updateTerrainTextures(images);
}
