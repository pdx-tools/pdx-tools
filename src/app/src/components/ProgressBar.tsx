import React from "react";
import { ZIndex } from "@/lib/zIndices";
import classes from "./ProgressBar.module.css";

interface ProgressBarProps {
  value: number;
  height: number;
  absolutePositioning?: boolean;
}

// https://alvarotrigo.com/blog/how-to-make-a-progress-bar-in-css/
export const ProgressBar = ({
  value,
  height,
  absolutePositioning,
}: ProgressBarProps) => {
  return (
    <div
      className="w-full bg-transparent"
      style={{ zIndex: ZIndex.AnalyzeProgressBar }}
    >
      <div
        className={`${classes.bar} h-full transition-[width] duration-200`}
        style={{
          width: `${value}%`,
          height,
          ...(absolutePositioning && { position: "absolute" }),
        }}
      ></div>
    </div>
  );
};
