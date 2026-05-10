import { GOODS_CELL_SIZE_32, goodsAtlasData, goodsAtlasUrl32, goodsDimensions32 } from "./goods";

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

export function goodsIconHtml(id: string): string {
  let index = goodsAtlasData[id];
  if (index === undefined) {
    warnOnce("goods", id);
    index = goodsAtlasData["_default"];
  }
  if (index === undefined) {
    const size = GOODS_CELL_SIZE_32 * ICON_SCALE;
    return `<span style="display:inline-block;width:${size}px;height:${size}px"></span>`;
  }
  const { row, col } = goodsDimensions32.coordinates(index);
  const size = GOODS_CELL_SIZE_32 * ICON_SCALE;
  const x = col * GOODS_CELL_SIZE_32 * ICON_SCALE;
  const y = row * GOODS_CELL_SIZE_32 * ICON_SCALE;
  const totalW = goodsDimensions32.cols * GOODS_CELL_SIZE_32 * ICON_SCALE;
  const totalH = goodsDimensions32.rows * GOODS_CELL_SIZE_32 * ICON_SCALE;
  return `<div style="display:inline-block;width:${size}px;height:${size}px;background-image:url(${goodsAtlasUrl32});background-position:-${x}px -${y}px;background-size:${totalW}px ${totalH}px;image-rendering:crisp-edges;vertical-align:middle"></div>`;
}
