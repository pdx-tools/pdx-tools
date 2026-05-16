import { Sprite } from "@/features/eu4/components/Sprite";
import {
  GOODS_CELL_SIZE_128,
  GOODS_CELL_SIZE_32,
  goodsAtlasData,
  goodsAtlasUrl128,
  goodsAtlasUrl32,
  goodsDimensions128,
  goodsDimensions32,
} from "./goods";

const warnedMissing = new Set<string>();
const ICON_SCALE = 0.5;

function warnOnce(family: string, id: string) {
  if (process.env.NODE_ENV !== "production") {
    const key = `${family}:${id}`;
    if (!warnedMissing.has(key)) {
      warnedMissing.add(key);
      console.warn(`[Eu5Icon] Missing icon: family="${family}" id="${id}"`);
    }
  }
}

function resolveGoodsIndex(id: string): number | undefined {
  if (id in goodsAtlasData) return goodsAtlasData[id];
  warnOnce("goods", id);
  return goodsAtlasData["_default"];
}

export function Eu5Icon({
  family,
  id,
  alt = id,
  className,
  size = "lg",
}: {
  family: "goods";
  id: string;
  alt?: string;
  className?: string;
  size?: "sm" | "lg";
}) {
  if (family === "goods") {
    const index = resolveGoodsIndex(id);
    const cellSize = size === "sm" ? GOODS_CELL_SIZE_32 : GOODS_CELL_SIZE_128;
    const src = size === "sm" ? goodsAtlasUrl32 : goodsAtlasUrl128;
    const dimensions = size === "sm" ? goodsDimensions32 : goodsDimensions128;
    if (index === undefined) {
      return (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: cellSize * ICON_SCALE,
            height: cellSize * ICON_SCALE,
          }}
          className={className}
        />
      );
    }
    return (
      <Sprite
        src={src}
        alt={alt}
        index={index}
        dimensions={dimensions}
        scale={ICON_SCALE}
        className={className}
      />
    );
  }
}
