import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch, useAppSelector } from "@/lib/store";
import { usePrevious } from "@/hooks/usePrevious";
import { useCanvasPointerEvents } from "./useCanvasPointerEvents";
import {
  useEu4CanvasRef,
  selectAnalyzeId,
  selectCanvasWidth,
  selectCanvasHeight,
  getEu4Canvas,
  WorkerClient,
  useWorkerOnSave,
  moduleDrawn,
  useCanvasRef,
  getCanvas,
} from "@/features/engine";
import {
  selectEu4MapColorPayload,
  selectEu4MapDecorativeSettings,
} from "../eu4Slice";

type CanvasState = "initial" | "drawn";
export function useMap() {
  const dispatch = useAppDispatch();
  const canvasRef = useCanvasRef();
  const mapRef = useEu4CanvasRef();
  const analysisId = useSelector(selectAnalyzeId);
  const mapDecorativeSettings = useSelector(selectEu4MapDecorativeSettings);
  const mapColorPayload = useSelector(selectEu4MapColorPayload);
  const canvasWidth = useSelector(selectCanvasWidth);
  const canvasHeight = useSelector(selectCanvasHeight);
  const mapPosition = useAppSelector((state) => state.eu4.mapPosition);
  const mapColorPayloadPrev = usePrevious(mapColorPayload);
  const canvasState = useRef<CanvasState>("initial");
  const [renderToken, setRenderToken] = useState(0);

  useCanvasPointerEvents();

  useEffect(() => {
    canvasState.current = "initial";
  }, [analysisId]);

  useEffect(() => {
    async function analyzedEffect() {
      if (!canvasWidth || !canvasHeight) {
        return;
      }

      const map = getEu4Canvas(mapRef);
      if (canvasState.current == "initial") {
        map.resize(canvasWidth, canvasHeight);

        map.cameraFromDimesions(
          [canvasWidth, Math.floor(canvasHeight)],
          mapPosition
        );

        setRenderToken(1);
      }
    }

    analyzedEffect();
  }, [mapRef, mapPosition, canvasState, canvasWidth, canvasHeight]);

  useEffect(() => {
    if (canvasState.current == "initial") {
      return;
    }

    const map = getEu4Canvas(mapRef);
    map.resize(canvasWidth, Math.floor(canvasHeight));
  }, [mapRef, canvasState, canvasWidth, canvasHeight]);

  const updateMapColorsCb = useCallback(
    async (worker: WorkerClient) => {
      if (renderToken == 0) {
        return;
      }

      const map = getEu4Canvas(mapRef);
      if (
        mapColorPayloadPrev != mapColorPayload ||
        canvasState.current != "drawn"
      ) {
        const [primary, secondary] = await worker.eu4MapColors(mapColorPayload);
        map.map?.updateProvinceColors(primary, secondary);
      }

      map.setControls(mapDecorativeSettings);

      if (renderToken == 1 && canvasState.current != "drawn") {
        map.redrawMapNow();
        requestAnimationFrame(() => {
          dispatch(moduleDrawn());
          getCanvas(canvasRef).hidden = false;
        });
        canvasState.current = "drawn";
      } else {
        map.redrawMapImage();
      }

      setRenderToken(1);
    },

    // eslint can't tell that mapColorPayloadPrev is stable
    // https://github.com/facebook/react/issues/20752
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      canvasRef,
      mapRef,
      mapColorPayload,
      mapDecorativeSettings,
      canvasState,
      dispatch,
      renderToken,
    ]
  );

  useEffect(() => {
    return () => {
      getCanvas(canvasRef).hidden = true;
    };
  }, []);

  useWorkerOnSave(updateMapColorsCb);
}
