import { spriteDimension } from "@/features/eu4/components/Sprite";
import data from "./goods.json";
import url32 from "./goods_x32.webp";
import url128 from "./goods_x128.webp";

export const goodsAtlasData: Record<string, number> = data;
export const goodsAtlasUrl32: string = url32;
export const goodsAtlasUrl128: string = url128;
export const GOODS_CELL_SIZE_32 = 32;
export const GOODS_CELL_SIZE_128 = 128;

export const goodsDimensions32 = spriteDimension({
  data,
  spriteCell: { width: GOODS_CELL_SIZE_32, height: GOODS_CELL_SIZE_32 },
});

export const goodsDimensions128 = spriteDimension({
  data,
  spriteCell: { width: GOODS_CELL_SIZE_128, height: GOODS_CELL_SIZE_128 },
});
