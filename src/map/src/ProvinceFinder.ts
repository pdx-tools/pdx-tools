import { IMG_WIDTH } from "./mapDimensions";

export class ProvinceFinder {
  constructor(
    private west: Uint16Array,
    private east: Uint16Array,
    private width: number,
    private height: number,
    private colorIndexToProvinceId: Uint16Array,
  ) {}

  findProvinceId(x: number, y: number) {
    if (isNaN(x) || isNaN(y)) {
      return undefined;
    }

    const halfWidth = this.width;
    const px = ((Math.floor(x) % IMG_WIDTH) + IMG_WIDTH) % IMG_WIDTH;
    const py = Math.min(Math.max(Math.floor(y), 0), this.height - 1);
    const isWest = px < halfWidth;
    const localX = isWest ? px : px - halfWidth;
    const arr = isWest ? this.west : this.east;
    const colorIndex = arr[py * halfWidth + localX];
    return {
      r: 0,
      g: 0,
      b: 0,
      colorIndex,
      provinceId: this.colorIndexToProvinceId[colorIndex],
    };
  }

  close() {}
}
