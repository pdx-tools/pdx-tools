import { cx } from "class-variance-authority";
import { Sprite } from "@/components/Sprite";
import { FLAG_CELL_HEIGHT, flagSprite } from "./index";

/**
 * Rendered flag heights (width follows the 1.5:1 aspect ratio).
 *
 * `xl` renders at the atlas' native cell size (72×48), so it displays 1:1 from
 * the base atlas and pulls the 144×96 tile on a 2x retina display.
 */
const SIZE_HEIGHT = {
  xs: 12,
  sm: 16,
  base: 24,
  lg: 32,
  xl: 48,
} as const;

export type Eu5FlagSize = keyof typeof SIZE_HEIGHT;

/**
 * Renders an EU5 country flag (coat of arms) from the pre-rendered atlas.
 *
 * `flag` is the country's coat of arms key (`CountryRef.flag`). Unknown or
 * missing keys fall back to a solid swatch of the country's color when
 * available, otherwise a neutral placeholder box.
 */
export function Eu5Flag({
  flag,
  colorHex,
  size = "base",
  alt = "",
  className,
}: {
  flag: string | null | undefined;
  colorHex?: string;
  size?: Eu5FlagSize;
  alt?: string;
  className?: string;
}) {
  const height = SIZE_HEIGHT[size];
  const width = Math.round(height * 1.5);
  const sprite = flagSprite(flag);

  // The flag image is sized to the exact 1.5:1 box, while any caller-supplied
  // chrome (border/ring/rounding) lives on a shrink-to-fit wrapper so it sits
  // *outside* the flag. With the global `box-sizing: border-box`, a border on
  // the sized element would otherwise eat into the artwork and skew both the
  // aspect ratio and the sprite's centering.
  const inner =
    sprite === undefined ? (
      <span
        aria-hidden
        style={{
          display: "block",
          width,
          height,
          backgroundColor: colorHex ?? "var(--color-gray-400, #9ca3af)",
        }}
      />
    ) : (
      <Sprite
        src={sprite.src}
        srcSet={[
          [sprite.src, "1x"],
          [sprite.srcHi, "2x"],
        ]}
        alt={alt}
        index={sprite.index}
        dimensions={sprite.dimensions}
        scale={height / FLAG_CELL_HEIGHT}
      />
    );

  return (
    <span
      className={cx("inline-block overflow-hidden leading-none", className)}
      style={{ backgroundColor: colorHex }}
    >
      {inner}
    </span>
  );
}
