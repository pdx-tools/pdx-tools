/* eslint-disable @next/next/no-img-element */
import { cx } from "class-variance-authority";
import React from "react";

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
  srcSet?: string;
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

  const width = sprite?.width ?? dimensions.spriteCell.width;
  const height = sprite?.height ?? dimensions.spriteCell.height;
  const renderWidth = width * scale;
  const renderHeight = height * scale;

  const blurStyles = blurSrc
    ? {
        backgroundImage: `url(${blurSrc})`,
        backgroundPosition: `-${col * width}px -${row * height}px`,
        backgroundSize: `${dimensions.cols * 100}% ${dimensions.rows * 100}%`,
      }
    : {};

  const forcedDimensions = {
    minWidth: renderWidth,
    minHeight: renderHeight,
    maxWidth: renderWidth,
    maxHeight: renderHeight,
  };

  // Percentage of the number of columns where the icon is located at
  const colPortion = col / (dimensions.cols - 1);

  // If the icon is a different size than the sprite cell, compute the
  // max difference in percentage that we offset the object position
  const colMaxSizeDiff = (dimensions.spriteCell.width - width) / 2;

  // Scale our max difference by the column number it is found at
  const colOffset = colPortion * 100 - colMaxSizeDiff * colPortion;

  const rowPortion = row / (dimensions.rows - 1);
  const rowMaxSizeDiff = (dimensions.spriteCell.height - height) / 2;
  const rowOffset = rowPortion * 100 - rowMaxSizeDiff * rowPortion;

  const image = (
    <img
      src={src}
      alt={alt}
      height={height}
      width={width}
      srcSet={srcSet}
      className={cx(className, "object-none")}
      style={{
        ...blurStyles,
        ...(scale === 1 ? forcedDimensions : {}),
        objectPosition: `${colOffset}% ${rowOffset}%`,
      }}
    />
  );

  if (scale === 1) {
    return image;
  }

  return (
    <div style={forcedDimensions} className="relative">
      <div
        className="absolute flex"
        style={{
          width,
          height,
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      >
        {image}
      </div>
    </div>
  );
};
