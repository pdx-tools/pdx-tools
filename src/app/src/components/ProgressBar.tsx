import React from "react";
import { ZIndex } from "@/lib/zIndices";

interface ProgressBarProps {
  value: number;
  height: number;
  absolutePositioning?: boolean;
}

// https://alvarotrigo.com/blog/how-to-make-a-progress-bar-in-css/
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  height,
  absolutePositioning,
}) => {
  return (
    <div className="progress">
      <div
        className="progress__bar"
        style={{
          width: `${value}%`,
          height,
          ...(absolutePositioning && { position: "absolute" }),
        }}
      ></div>
      <style jsx>{`
        .progress {
          z-index: ${ZIndex.AnalyzeProgressBar};
          width: 100%;
          background: transparent;
          transition: height 1s ease-in-out;
        }

        .progress__bar {
          height: 100%;
          background: repeating-linear-gradient(
            135deg,
            #036ffc,
            #036ffc 20px,
            #1163cf 20px,
            #1163cf 40px
          );
          transition: width 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
};
