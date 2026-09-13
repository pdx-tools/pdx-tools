import { useEffect, useState } from "react";
import { CursorTooltip } from "@/components/CursorTooltip";
import { useCursorPosition } from "@/hooks/useCursorPosition";
import { selectDate, useEu4Context, useEu4Map, useEu4MapMode } from "../../store";
import type { QuickTipPayload } from "../../types/map";
import { getEu4Worker } from "../../worker";
import { MapTipContents } from "./MapTipContents";

export function Eu4CursorTooltip() {
  const [provinceId, setProvinceId] = useState(0);
  const [mapTip, setMapTip] = useState<{
    key: string;
    data: NonNullable<QuickTipPayload>;
  } | null>(null);
  const map = useEu4Map();
  const mapMode = useEu4MapMode();
  const store = useEu4Context();
  const cursorRef = useCursorPosition(map.canvas);
  const mapTipKey = `${provinceId}:${mapMode}`;

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
    if (provinceId === 0) return;

    const requestKey = mapTipKey;
    let isMounted = true;
    const timer = setTimeout(async () => {
      const days = selectDate(store.getState()).enabledDays;
      const data = await getEu4Worker().eu4GetMapTooltip(provinceId, mapMode, days);
      if (isMounted) setMapTip(data ? { key: requestKey, data } : null);
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [mapTipKey, provinceId, mapMode, store]);

  const visibleMapTip = mapTip?.key === mapTipKey ? mapTip.data : null;

  return (
    <CursorTooltip cursorRef={cursorRef} visible={visibleMapTip !== null}>
      {visibleMapTip && <MapTipContents tip={visibleMapTip} />}
    </CursorTooltip>
  );
}
