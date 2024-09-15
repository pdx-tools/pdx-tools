self.onmessage = (ev) => {
  const canvas: OffscreenCanvas = ev.data.canvas;
  const data: Uint8ClampedArray = ev.data.data;
  const ctx = canvas.getContext("2d")!;
  const image = new ImageData(data, canvas.width, canvas.height);
  ctx.putImageData(image, 0, 0);
  canvas.convertToBlob().then((blob) => {
    self.postMessage({ blob });
  });
};
