import React from "react";
import classes from "./SideBarButton.module.css";

export interface SideBarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  index?: number;
}

export const SideBarButton = ({
  index,
  children,
  style,
  className,
  ...rest
}: SideBarButtonProps) => {
  const duration = { "--slide-duration": 1 - 0.1 * ((index ?? 0) + 1) };
  const durationStyle = duration as React.CSSProperties;
  return (
    <button
      style={{ ...style, ...durationStyle }}
      className={`${className} ${classes["slide-in"]} w-[60px] h-[60px] bg-rose-800 active:bg-rose-900 border-1 border-solid border-black drop-shadow-md`}
      {...rest}
    >
      {children}
    </button>
  );
};
