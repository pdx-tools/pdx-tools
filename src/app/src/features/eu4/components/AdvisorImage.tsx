import React from "react";
import { Sprite, SpriteDimension, spriteDimension } from "./Sprite";

let dimensions: SpriteDimension | undefined;
let data: any;
let srcSet: [string, string][] | undefined;

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
  dimensions ??= spriteDimension({
    data,
    spriteCell: { width: 48, height: 48 },
  });

  const index = data[id];
  if (index === undefined) {
    return null;
  }

  srcSet ??= [
    [require(`@/images/eu4/advisors/advisors_x64.webp`), `1.33x`],
    [require(`@/images/eu4/advisors/advisors_x77.webp`), `1.60x`],
  ];

  return (
    <Sprite
      {...props}
      src={require("@/images/eu4/advisors/advisors_x48.webp")}
      srcSet={srcSet}
      alt={alt ?? ""}
      dimensions={dimensions}
      index={index}
      scale={size / 48}
    />
  );
}
