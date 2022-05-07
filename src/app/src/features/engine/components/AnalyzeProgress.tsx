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
    <div ref={overlay}>
      <ProgressBar
        value={fileLoadPercent}
        height={height}
        absolutePositioning={true}
      />
      <div className="shade" style={{ height: shadeHeight }}></div>
      <style jsx>{`
        div {
          position: absolute;
          top: 0;
          width: 100%;
          height: 100%;
        }

        .shade {
          background-color: rgba(45, 45, 45, 0.5);
          z-index: ${ZIndex.AnalyzeShadeOverlay};
        }
      `}</style>
    </div>
  );
};
