import { useEffect, useState } from "react";
import { CursorTooltip } from "@/components/CursorTooltip";
import { useCursorPosition } from "@/hooks/useCursorPosition";
import { selectDate, useEu4Context, useEu4Map, useEu4MapMode } from "../../store";
import type { QuickTipPayload } from "../../types/map";
import { getEu4Worker } from "../../worker";
import { MapTipContents } from "./MapTipContents";

export function Eu4CursorTooltip() {
  const [provinceId, setProvinceId] = useState(0);
  const [mapTip, setMapTip] = useState<QuickTipPayload | null>(null);
  const map = useEu4Map();
  const mapMode = useEu4MapMode();
  const store = useEu4Context();
  const cursorRef = useCursorPosition(map.canvas);

  useEffect(() => {
    let isMounted = true;
    map.register({
      onProvinceHover(id) {
        if (isMounted) setProvinceId(id);
      },
    });
    return () => {
      isMounted = false;
    };
  }, [map]);

  useEffect(() => {
    setMapTip(null);

    if (provinceId === 0) return;

    let isMounted = true;
    const timer = setTimeout(async () => {
      const state = store.getState();
      const currentMapDate = selectDate(mapMode, state.save.meta, state.selectedDate);
      const days = currentMapDate.enabledDays;
      const data = await getEu4Worker().eu4GetMapTooltip(provinceId, mapMode, days);
      if (isMounted) setMapTip(data);
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [provinceId, mapMode, store]);

  return (
    <CursorTooltip cursorRef={cursorRef} visible={mapTip !== null}>
      {mapTip && <MapTipContents tip={mapTip} />}
    </CursorTooltip>
  );
}
