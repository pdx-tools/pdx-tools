import {
  getWasmWorker,
  useEu4CanvasRef,
  useWasmWorker,
} from "@/features/engine";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { selectEu4MapColorPayload } from "../../eu4Slice";
import { QuickTipPayload } from "../../types/map";
import { MapTipContents } from "./MapTipContents";

interface MousePosition {
  x: number;
  y: number;
}

export const MapTip = () => {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });
  const [pointer, setPointer] = useState<MousePosition>({ x: 0, y: 0 });
  const [pointerDisplay, setPointerDisplay] = useState(false);
  const toolTipRef = useRef<HTMLDivElement>(null);
  const eu4CanvasRef = useEu4CanvasRef();
  const tooltipTimer = useRef<ReturnType<typeof setTimeout>>();
  const [timerDisplay, setTimerDisplay] = useState(false);
  const wasmWorkerRef = useWasmWorker();
  const [mapTip, setMapTip] = useState<QuickTipPayload | null>(null);
  const [provinceId, setProvinceId] = useState(0);
  const mapColor = useSelector(selectEu4MapColorPayload);
  const isMounted = useIsMounted();

  useEffect(() => {
    let isDown = false;

    function pointerMove(e: PointerEvent) {
      setPointerDisplay(
        !isDown && e.target instanceof Element && e.target.nodeName == "CANVAS"
      );
      setPointer({ x: e.x, y: e.y });
    }

    function pointerDown() {
      isDown = true;
    }

    function pointerUp() {
      isDown = false;
    }

    document.addEventListener("pointermove", pointerMove, false);
    document.addEventListener("pointerdown", pointerDown, false);
    document.addEventListener("pointerup", pointerUp, false);
    return () => {
      document.removeEventListener("pointermove", pointerMove, false);
      document.removeEventListener("pointerdown", pointerDown, false);
      document.removeEventListener("pointerup", pointerUp, false);
    };
  }, [toolTipRef]);

  useEffect(() => {
    function mouseOut() {
      setPointerDisplay(false);
    }

    document.addEventListener("mouseout", mouseOut);
    return () => {
      document.removeEventListener("mouseout", mouseOut);
    };
  }, []);

  // Recalculate tooltip positioning if the mouse pointer moves or if the
  // contents of map tip changes
  useLayoutEffect(() => {
    if (!toolTipRef.current) {
      return;
    }

    const rect = toolTipRef.current.getBoundingClientRect();

    const x = Math.min(
      document.documentElement.clientWidth - rect.width - 5,
      pointer.x + 10
    );

    let y = Math.min(
      document.documentElement.clientHeight - rect.height - 5,
      pointer.y + 10
    );

    // Make the map tip above the cursor when at the bottom of the page to avoid
    // DOM flicker
    if (y < pointer.y) {
      y = pointer.y - rect.height - 5;
    }

    setPosition({ x, y });
  }, [mapTip, toolTipRef, pointer.x, pointer.y]);

  useEffect(() => {
    setTimerDisplay(true);
  }, [mapTip]);

  useEffect(() => {
    const map = eu4CanvasRef.current?.map;
    if (map) {
      map.onProvinceHover = (e) => {
        if (isMounted()) {
          setProvinceId(e);
        }
      };
    }
  }, [eu4CanvasRef, isMounted]);

  useEffect(() => {
    if (provinceId == 0) {
      return;
    }

    const worker = getWasmWorker(wasmWorkerRef);
    if (tooltipTimer.current) {
      clearTimeout(tooltipTimer.current);
    }
    setTimerDisplay(false);

    tooltipTimer.current = setTimeout(async () => {
      const data = await worker.eu4GetMapTooltip(provinceId, mapColor);
      if (isMounted()) {
        setMapTip(data);
      }
    }, 250);

    return () => {
      if (tooltipTimer.current) {
        clearTimeout(tooltipTimer.current);
      }
    };
  }, [provinceId, wasmWorkerRef, mapColor, isMounted]);

  // When we are calculating (or don't want to display) the tooltip,
  // set the opacity to 0 instead of removing the display so that the width
  // can be calculated. And position it in the upper right quadrant so that
  // there is no chance of it overflowing the canvas (causing a redraw).
  const toolTipStyle =
    timerDisplay && pointerDisplay
      ? {
          opacity: 100,
          top: position.y,
          left: position.x,
        }
      : {
          opacity: 0,
          top: 0,
          left: 0,
        };

  return (
    <div
      ref={toolTipRef}
      className="absolute drop-shadow-md pointer-events-none"
      style={toolTipStyle}
    >
      {mapTip && <MapTipContents tip={mapTip} />}
    </div>
  );
};
