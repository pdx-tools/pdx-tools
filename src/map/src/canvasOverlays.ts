export function overlayDate({
  date,
  ctx2d,
  textMetrics,
  scale,
}: {
  date: string;
  ctx2d: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  textMetrics: TextMetrics;
  scale: number;
}) {
  const textHeight =
    textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
  const textWidth =
    textMetrics.actualBoundingBoxLeft + textMetrics.actualBoundingBoxRight;
  ctx2d.fillStyle = "#20272c";
  ctx2d.fillRect(
    0,
    ctx2d.canvas.height - textHeight * 3,
    textWidth + 32 * scale,
    textHeight * 3,
  );
  ctx2d.fillStyle = "#ffffff";
  ctx2d.fillText(date, 16 * scale, ctx2d.canvas.height - textHeight);
}
