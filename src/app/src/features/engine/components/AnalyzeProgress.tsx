import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { ProgressBar } from "../../../components/ProgressBar";
import { ZIndex } from "../../../lib/zIndices";
import { selectSaveAnalayzePercent } from "../engineSlice";

export const AnalyzeProgress = () => {
  const overlay = useRef<HTMLDivElement>(null);
  const fileLoadPercent = useSelector(selectSaveAnalayzePercent);
  const [restHeight, setRestHeight] = useState(0);
  const height = 30;

  useEffect(() => {
    setRestHeight(overlay.current?.getBoundingClientRect().y || 0);
  }, [overlay]);

  const shadeHeight = `calc(100% - ${restHeight}px)`;

  return (
    <div className="absolute top-0 w-full h-full" ref={overlay}>
      <ProgressBar
        value={fileLoadPercent}
        height={height}
        absolutePositioning={true}
      />
      <div
        className="absolute top-0 w-full h-full bg-gray-500/50"
        style={{ height: shadeHeight, zIndex: ZIndex.AnalyzeShadeOverlay }}
      ></div>
    </div>
  );
};
