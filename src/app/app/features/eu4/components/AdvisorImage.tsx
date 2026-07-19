import { Sprite, spriteDimension } from "@/components/Sprite";
import type { SpriteDimension } from "@/components/Sprite";
import spriteData from "@/images/eu4/advisors/advisors.json";
import advisors from "@/images/eu4/advisors/advisors.webp";

let dimensions: SpriteDimension | undefined;

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

  return (
    <Sprite
      {...props}
      src={advisors}
      alt={alt ?? ""}
      dimensions={dimensions}
      index={index}
      scale={size / 48}
      rendering="smooth"
    />
  );
}
