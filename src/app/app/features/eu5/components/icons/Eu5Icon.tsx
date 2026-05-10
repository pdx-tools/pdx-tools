import { Sprite } from "@/features/eu4/components/Sprite";
import { GOODS_CELL_SIZE_128, goodsAtlasData, goodsAtlasUrl128, goodsDimensions128 } from "./goods";

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
}: {
  family: "goods";
  id: string;
  alt?: string;
  className?: string;
}) {
  if (family === "goods") {
    const index = resolveGoodsIndex(id);
    if (index === undefined) {
      return (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: GOODS_CELL_SIZE_128 * ICON_SCALE,
            height: GOODS_CELL_SIZE_128 * ICON_SCALE,
          }}
          className={className}
        />
      );
    }
    return (
      <Sprite
        src={goodsAtlasUrl128}
        alt={alt}
        index={index}
        dimensions={goodsDimensions128}
        scale={ICON_SCALE}
        className={className}
      />
    );
  }
}
