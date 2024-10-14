import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  selectDate,
  useEu4Context,
  useEu4Map,
  useEu4MapMode,
} from "../../store";
import { QuickTipPayload } from "../../types/map";
import { getEu4Worker } from "../../worker";
import { MapTipContents } from "./MapTipContents";

type MousePosition = {
  x: number;
  y: number;
};

export const MapTip = () => {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });
  const [pointer, setPointer] = useState<MousePosition>({ x: 0, y: 0 });
  const [pointerDisplay, setPointerDisplay] = useState(false);
  const toolTipRef = useRef<HTMLDivElement>(null);
  const [timerDisplay, setTimerDisplay] = useState(false);
  const [mapTip, setMapTip] = useState<QuickTipPayload | null>(null);
  const [provinceId, setProvinceId] = useState(0);
  const map = useEu4Map();
  const canvas = map.canvas;

  useEffect(() => {
    let isDown = false;

    function pointerMove(e: PointerEvent) {
      setPointerDisplay(
        !isDown && e.target instanceof Element && e.target.nodeName == "CANVAS",
      );
      setPointer({ x: e.x, y: e.y });
    }

    function pointerDown() {
      isDown = true;
    }

    function pointerUp() {
      isDown = false;
    }

    canvas.addEventListener("pointermove", pointerMove, false);
    canvas.addEventListener("pointerdown", pointerDown, false);
    canvas.addEventListener("pointerup", pointerUp, false);
    return () => {
      canvas.removeEventListener("pointermove", pointerMove, false);
      canvas.removeEventListener("pointerdown", pointerDown, false);
      canvas.removeEventListener("pointerup", pointerUp, false);
    };
  }, [toolTipRef, canvas]);

  useEffect(() => {
    function mouseOut() {
      setPointerDisplay(false);
    }

    canvas.addEventListener("mouseout", mouseOut);
    return () => {
      canvas.removeEventListener("mouseout", mouseOut);
    };
  }, [canvas]);

  // Recalculate tooltip positioning if the mouse pointer moves or if the
  // contents of map tip changes
  useLayoutEffect(() => {
    if (!toolTipRef.current) {
      return;
    }

    const rect = toolTipRef.current.getBoundingClientRect();

    const x = Math.min(
      document.documentElement.clientWidth - rect.width - 5,
      pointer.x + 10,
    );

    let y = Math.min(
      document.documentElement.clientHeight - rect.height - 5,
      pointer.y + 10,
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
    let isMounted = true;
    map.register({
      onProvinceHover(provinceId) {
        if (isMounted) {
          setProvinceId(provinceId);
        }
      },
    });

    return () => {
      isMounted = false;
    };
  }, [map]);

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
      className="pointer-events-none absolute"
      style={toolTipStyle}
    >
      {provinceId !== 0 ? (
        <MapTipProvince
          provinceId={provinceId}
          mapTip={mapTip}
          setMapTip={setMapTip}
          setTimerDisplay={setTimerDisplay}
        />
      ) : null}
    </div>
  );
};

function MapTipProvince({
  provinceId,
  mapTip,
  setMapTip,
  setTimerDisplay,
}: {
  provinceId: number;
  mapTip: QuickTipPayload | null;
  setMapTip: (arg: QuickTipPayload | null) => void;
  setTimerDisplay: (arg: boolean) => void;
}) {
  const tooltipTimer = useRef<ReturnType<typeof setTimeout>>();
  const mapMode = useEu4MapMode();
  const store = useEu4Context();

  useEffect(() => {
    let isMounted = true;
    const worker = getEu4Worker();
    if (tooltipTimer.current) {
      clearTimeout(tooltipTimer.current);
    }
    setTimerDisplay(false);

    tooltipTimer.current = setTimeout(async () => {
      const state = store.getState();
      const mapMode = state.mapMode;
      const currentMapDate = selectDate(
        mapMode,
        state.save.meta,
        state.selectedDate,
      );

      const days = currentMapDate.enabledDays;
      const data = await worker.eu4GetMapTooltip(provinceId, mapMode, days);
      if (isMounted) {
        setMapTip(data);
      }
    }, 250);

    return () => {
      isMounted = false;
      if (tooltipTimer.current) {
        clearTimeout(tooltipTimer.current);
      }
    };
  }, [provinceId, mapMode, store, setMapTip, setTimerDisplay]);

  if (!mapTip) {
    return null;
  }

  return <MapTipContents tip={mapTip} />;
}
