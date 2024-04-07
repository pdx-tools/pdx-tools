import React from "react";

export type SpriteDimension = ReturnType<typeof spriteDimension>;
export function spriteDimension({ data }: { data: Record<string, number> }) {
  const total = Object.keys(data).length;
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  return {
    cols,
    rows,
    coordinates: (index: number) => ({
      row: Math.floor(index / cols),
      col: index % cols,
    }),
  };
}

type SpriteProps = {
  src: string;
  index: number;
  width: number;
  height: number;
  dimensions: SpriteDimension;
  ariaLabel?: string;
  className?: string;
};

export const Sprite = React.forwardRef<HTMLDivElement, SpriteProps>(
  function Sprite(
    { src, index, width, height, dimensions, ariaLabel, ...props },
    ref,
  ) {
    const { row, col } = dimensions.coordinates(index);
    return (
      <div
        {...props}
        ref={ref}
        role={ariaLabel ? "img" : "presentation"}
        aria-label={ariaLabel}
        style={{
          width,
          height,
          backgroundImage: `url(${src})`,
          backgroundPosition: `-${col * width}px -${row * height}px`,
          backgroundSize: `${dimensions.cols * 100}% ${dimensions.rows * 100}%`,
        }}
      />
    );
  },
);
