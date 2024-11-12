import React from "react";
import { Sprite, SpriteDimension, spriteDimension } from "./Sprite";
import spriteData from "@/images/eu4/advisors/advisors.json";
import advisor48 from "@/images/eu4/advisors/advisors_x48.webp";
import advisor64 from "@/images/eu4/advisors/advisors_x64.webp";
import advisor77 from "@/images/eu4/advisors/advisors_x77.webp";

let dimensions: SpriteDimension | undefined;
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
  dimensions ??= spriteDimension({
    data: spriteData,
    spriteCell: { width: 48, height: 48 },
  });

  if (!(id in spriteData)) {
    return null;
  }

  const index = spriteData[id as keyof typeof spriteData];
  srcSet ??= [
    [advisor64, `1.33x`],
    [advisor77, `1.60x`],
  ];

  return (
    <Sprite
      {...props}
      src={advisor48}
      srcSet={srcSet}
      alt={alt ?? ""}
      dimensions={dimensions}
      index={index}
      scale={size / 48}
    />
  );
}
