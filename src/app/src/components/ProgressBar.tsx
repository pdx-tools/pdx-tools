import React from "react";
import classes from "./ProgressBar.module.css";

interface ProgressBarProps {
  value: number;
  height: number;
}

// https://alvarotrigo.com/blog/how-to-make-a-progress-bar-in-css/
export const ProgressBar = ({ value, height }: ProgressBarProps) => {
  return (
    <div className="w-full bg-transparent">
      <div
        className={`${classes.bar} h-full transition-[width] duration-200`}
        style={{
          width: `${value}%`,
          height,
        }}
      ></div>
    </div>
  );
};
