import Image from "next/image";
import React from "react";
import app from "./app.svg";

type AppSvgProps = {
  alt?: string;
  className?: string;
  width: number;
  height: number;
};

export const AppSvg = ({ alt, height, width, ...props }: AppSvgProps) => {
  return (
    <Image
      alt={alt ?? "logo"}
      src={app}
      width={width}
      height={height}
      {...props}
    />
  );
};
