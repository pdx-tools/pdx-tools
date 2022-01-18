import {
  useEu4CanvasRef,
  getEu4Canvas,
} from "@/features/engine/persistant-canvas-context";
import { useWasmWorker, getWasmWorker } from "@/features/engine";
import { useCallback } from "react";
import {
  useSideBarContainer,
  getSideBarContainerWidth,
} from "../components/SideBarContainer";

export function usePanTag() {
  const workerRef = useWasmWorker();
  const eu4CanvasRef = useEu4CanvasRef();
  const sidebarContainer = useSideBarContainer();

  return useCallback(
    async (tag: string) => {
      const worker = getWasmWorker(workerRef);
      const eu4Canvas = getEu4Canvas(eu4CanvasRef);
      const width = getSideBarContainerWidth(sidebarContainer);

      const pos = await worker.eu4MapPositionOf(tag);
      eu4Canvas.focusCameraOn(pos, {
        offsetX: width,
      });
      eu4Canvas.redrawViewport();
    },
    [workerRef, eu4CanvasRef, sidebarContainer]
  );
}
