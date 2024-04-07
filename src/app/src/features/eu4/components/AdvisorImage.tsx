import React from "react";
import { Sprite, SpriteDimension, spriteDimension } from "./Sprite";

let dimensions: SpriteDimension | undefined;
let data: any;

export function AdvisorImage({
  id,
  alt,
  size,
  ...props
}: {
  id: string;
  alt?: string;
  size: 32 | 48;
  className?: string;
}) {
  data ??= require(`@/images/eu4/advisors/advisors.json`);
  dimensions ??= spriteDimension({ data });

  const index = data[id];
  if (index === undefined) {
    return null;
  }

  return (
    <Sprite
      {...props}
      src={require("@/images/eu4/advisors/advisors.webp")}
      height={size}
      width={size}
      dimensions={dimensions}
      index={index}
      ariaLabel={alt}
    />
  );
}
