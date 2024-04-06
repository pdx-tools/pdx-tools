export function spriteDimension({ data }: { data: Record<string, number> }) {
  const total = Object.keys(data).length;
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  return { cols, rows };
}

export function Sprite({
  src,
  index,
  width,
  height,
  dimensions,
  ariaLabel,
}: {
  src: string;
  index: number;
  width: number;
  height: number;
  dimensions: ReturnType<typeof spriteDimension>;
  ariaLabel?: string;
}) {
  const row = Math.floor(index / dimensions.cols);
  const col = index % dimensions.cols;

  return (
    <div
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      style={{
        width,
        height,
        backgroundImage: `url(${src})`,
        backgroundPosition: `-${col * width}px -${row * height}px`,
        backgroundSize: `${dimensions.cols * 100}% ${dimensions.rows * 100}%`,
      }}
    />
  );
}
