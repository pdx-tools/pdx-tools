const WIDTH = 96;
const HEIGHT = 40;

/**
 * The curve behind the line "Top 10% hold N%", as a small figure beside that line: the
 * share of the total that the largest rows hold, in order. The tick stands on the top tenth.
 */
export function ShareCurve({
  values,
  noun,
  metric,
}: {
  values: readonly number[];
  noun: string;
  metric: string;
}) {
  const positive = values.filter((v) => v > 0).sort((a, b) => b - a);
  const total = positive.reduce((sum, v) => sum + v, 0);
  if (values.length < 10 || total <= 0) return null;
  const points = positive.reduce<{ x: number; y: number; sum: number }[]>((all, v, i) => {
    const sum = (all.at(-1)?.sum ?? 0) + v;
    all.push({ x: ((i + 1) / values.length) * WIDTH, y: HEIGHT - (sum / total) * HEIGHT, sum });
    return all;
  }, []);
  const marked = points[Math.min(Math.ceil(values.length / 10), points.length) - 1];
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <figure className="flex shrink-0 flex-col items-end gap-0.5">
      <svg
        role="img"
        aria-label={`Share of ${metric} held by the largest ${noun.toLowerCase()}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-10 w-24 shrink-0 text-game-ink-300"
      >
        <title>{`Share of ${metric} held by the largest ${noun.toLowerCase()}, in order`}</title>
        <polygon
          points={`0,${HEIGHT} ${line} ${WIDTH},${HEIGHT}`}
          fill="currentColor"
          opacity={0.18}
        />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} />
        <line
          x1={marked.x}
          x2={marked.x}
          y1={HEIGHT}
          y2={marked.y}
          stroke="var(--game-ink-100)"
          strokeWidth={1}
        />
      </svg>
      <figcaption className="text-[12px] leading-none text-game-ink-500">
        Share, largest first
      </figcaption>
    </figure>
  );
}
