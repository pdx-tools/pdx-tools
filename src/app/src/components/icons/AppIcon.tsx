import React, { ImgHTMLAttributes } from "react";
import app from "./app.svg";

type AppSvgProps = ImgHTMLAttributes<HTMLImageElement>;
export const AppSvg = ({ alt, ...props }: AppSvgProps) => {
  return <img alt={alt ?? "logo"} src={app} {...props} />;
};
