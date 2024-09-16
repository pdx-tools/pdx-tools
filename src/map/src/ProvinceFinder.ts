export class ProvinceFinder {
  private ctx: OffscreenCanvasRenderingContext2D;
  constructor(
    provinces1: ImageBitmap,
    provinces2: ImageBitmap,
    private sortedColors: Uint8Array,
    private provinceColorIndex: Uint16Array,
  ) {
    const provinceCanvas = new OffscreenCanvas(
      provinces1.width * 2,
      provinces2.height,
    );
    provinceCanvas.width = provinces1.width * 2;
    provinceCanvas.height = provinces2.height;

    this.ctx = provinceCanvas.getContext("2d")!;

    // turn off anti-aliasing else we will get color values that don't exist
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(provinces1, 0, 0, provinces1.width, provinces1.height);
    this.ctx.drawImage(
      provinces2,
      provinces1.width,
      0,
      provinces2.width,
      provinces2.height,
    );
  }

  findProvinceId(x: number, y: number) {
    if (isNaN(x) || isNaN(y)) {
      return undefined;
    }

    const pixels = this.ctx.getImageData(x, y, 1, 1);
    const pixel: [number, number, number] = [
      pixels.data[0],
      pixels.data[1],
      pixels.data[2],
    ];
    const colorIndex = binarySearch(this.sortedColors, pixel);
    return {
      r: pixels.data[0],
      g: pixels.data[1],
      b: pixels.data[2],
      colorIndex,
      provinceId: this.provinceColorIndex[colorIndex],
    };
  }

  close() {}
}

// adaption of https://stackoverflow.com/a/29018745/433785
function binarySearch(colors: Uint8Array, rgb: [number, number, number]) {
  const step = 3;
  let m = 0;
  let n = colors.length / step - 1;
  while (m <= n) {
    const k = (n + m) >> 1;
    const cur = k * step;
    const cmp = comparePixel(colors, cur, rgb);
    if (cmp > 0) {
      m = k + 1;
    } else if (cmp < 0) {
      n = k - 1;
    } else {
      return k;
    }
  }
  return -m - 1;
}

function comparePixel(
  colors: Uint8Array,
  ind: number,
  rgb: [number, number, number],
) {
  return (
    rgb[0] - colors[ind] || rgb[1] - colors[ind + 1] || rgb[2] - colors[ind + 2]
  );
}
