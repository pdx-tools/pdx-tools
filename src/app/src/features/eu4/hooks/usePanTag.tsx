import {
  useWasmWorker,
  getWasmWorker,
  useEu4CanvasRef,
  getEu4Canvas,
  getEu4Map,
  useCanvasRef,
  getCanvas,
} from "@/features/engine";
import { useCallback } from "react";
import {
  useSideBarContainer,
  getSideBarContainerWidth,
} from "../components/SideBarContainer";

export function usePanTag() {
  const workerRef = useWasmWorker();
  const eu4CanvasRef = useEu4CanvasRef();
  const canvasRef = useCanvasRef();
  const sidebarContainer = useSideBarContainer();

  return useCallback(
    async (tag: string) => {
      const worker = getWasmWorker(workerRef);
      const canvas = getCanvas(canvasRef);
      const eu4Canvas = getEu4Canvas(eu4CanvasRef);
      const sideBarWidth = getSideBarContainerWidth(sidebarContainer);
      const map = getEu4Map(eu4CanvasRef);

      const pos = await worker.eu4MapPositionOf(tag);
      map.scale = 10000 / (canvas.width - sideBarWidth);
      eu4Canvas.focusCameraOn(pos, {
        offsetX: sideBarWidth,
      });

      eu4Canvas.redrawViewport();
    },
    [workerRef, canvasRef, eu4CanvasRef, sidebarContainer]
  );
}
