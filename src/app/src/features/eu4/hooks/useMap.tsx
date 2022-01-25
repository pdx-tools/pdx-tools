import { useCallback, useEffect, useRef } from "react";
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

type CanvasState = "initial" | "first-draw" | "drawn";
export function useMap() {
  const dispatch = useAppDispatch();
  const mapRef = useEu4CanvasRef();
  const canvasRef = useCanvasRef();
  const analysisId = useSelector(selectAnalyzeId);
  const mapDecorativeSettings = useSelector(selectEu4MapDecorativeSettings);
  const mapColorPayload = useSelector(selectEu4MapColorPayload);
  const canvasWidth = useSelector(selectCanvasWidth);
  const canvasHeight = useSelector(selectCanvasHeight);
  const mapPosition = useAppSelector((state) => state.eu4.mapPosition);
  const mapColorPayloadPrev = usePrevious(mapColorPayload);
  const canvasState = useRef<CanvasState>("initial");

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

        canvasState.current = "first-draw";
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
      if (canvasState.current == "initial") {
        return;
      }

      const map = getEu4Canvas(mapRef);
      const canvas = getCanvas(canvasRef);

      // Only on first draw do we blank out
      // the canvas to avoid a flash of janky content.
      if (canvasState.current == "first-draw") {
        canvas.style.opacity = "0";
      }

      if (mapColorPayloadPrev != mapColorPayload) {
        const [primary, secondary] = await worker.eu4MapColors(mapColorPayload);
        map.map?.updateProvinceColors(primary, secondary);
      }

      map.setControls(mapDecorativeSettings);
      map.redrawMapImage();

      if (canvasState.current == "first-draw") {
        requestAnimationFrame(() => {
          canvas.style.opacity = "100";
          dispatch(moduleDrawn());
        });
        canvasState.current = "drawn";
      }
    },

    // eslint can't tell that mapColorPayloadPrev is stable
    // https://github.com/facebook/react/issues/20752
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      mapRef,
      mapColorPayload,
      mapDecorativeSettings,
      canvasState,
      dispatch,
      canvasRef,
    ]
  );

  useWorkerOnSave(updateMapColorsCb);
}
