import { cx } from "class-variance-authority";
import React from "react";
import classes from "./Sprite.module.css";

export type SpriteDimension = ReturnType<typeof spriteDimension>;
export function spriteDimension({
  data,
  spriteCell,
}: {
  data: Record<string, number>;
  spriteCell: { width: number; height: number };
}) {
  const total = Object.keys(data).length;
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  return {
    cols,
    rows,
    spriteCell,
    coordinates: (index: number) => ({
      row: Math.floor(index / cols),
      col: index % cols,
    }),
  };
}

export const Sprite = ({
  src,
  blurSrc,
  srcSet,
  index,
  sprite,
  dimensions,
  alt,
  scale = 1,
  className,
}: {
  src: string;
  blurSrc?: string;
  srcSet?: [string, string][];
  index: number;
  sprite?: {
    width: number;
    height: number;
  };
  dimensions: SpriteDimension;
  alt: string;
  className?: string;
  scale?: number;
}) => {
  const { row, col } = dimensions.coordinates(index);

  const startx = col * dimensions.spriteCell.width * scale;
  const starty = row * dimensions.spriteCell.height * scale;
  const sizex = dimensions.cols * dimensions.spriteCell.width * scale;
  const sizey = dimensions.rows * dimensions.spriteCell.height * scale;

  const width = sprite?.width ?? dimensions.spriteCell.width;
  const height = sprite?.height ?? dimensions.spriteCell.height;

  const forcedDimensions = {
    minWidth: width * scale,
    minHeight: height * scale,
    maxWidth: width * scale,
    maxHeight: height * scale,
  };

  const srcVar = (srcSet?.map(([url, res]) => `url(${url}) ${res}`) ?? []).join(
    ", ",
  );

  const image = (
    <div
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      className={cx(
        className,
        srcSet ? classes["sprite"] : classes["static-sprite"],
      )}
      style={
        {
          ...forcedDimensions,
          "--img-src": `url(${src})`,
          "--img-src-set": srcVar,
          backgroundPosition: `-${startx}px -${starty}px`,
          backgroundSize: `${sizex}px ${sizey}px`,
        } as React.CSSProperties
      }
    />
  );

  if (blurSrc === undefined) {
    return image;
  }

  const blurStyles = blurSrc
    ? {
        backgroundImage: `url(${blurSrc})`,
        backgroundPosition: `-${col * width}px -${row * height}px`,
        backgroundSize: `${dimensions.cols * 100}% ${dimensions.rows * 100}%`,
      }
    : {};

  return (
    <div style={forcedDimensions} className="relative">
      <div className="absolute inset-0" style={blurStyles}>
        {image}
      </div>
    </div>
  );
};
