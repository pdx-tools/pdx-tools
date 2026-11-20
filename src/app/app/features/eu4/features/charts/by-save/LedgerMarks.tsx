import { memo } from "react";
import { needsRim } from "./ledgerGeometry";
import type { StripGeometry } from "./ledgerGeometry";
import { centerOf, ink, yOf } from "./ledgerLayout";
import type { Mark, Scale } from "./ledgerLayout";

/**
 * One stroke per save, every stroke the same whole-pixel width, and the
 * row's reference lines. Drawn again only when the data or the size changes.
 */
export const Strip = memo(function Strip({
  marks,
  geometry,
  width,
  height,
  scale,
  world,
  dark,
}: {
  marks: readonly (Mark | null)[];
  geometry: StripGeometry;
  width: number;
  height: number;
  scale: Scale;
  world: boolean;
  dark: boolean;
}) {
  const y = yOf(scale, height, world);
  const rim = dark ? "rgb(255 255 255 / 0.6)" : "rgb(15 23 42 / 0.6)";
  return (
    <svg width={width} height={height} className="block" shapeRendering="crispEdges">
      {scale.refs.map((ref) => {
        const at = Math.round(y(ref)) + 0.5;
        return (
          <line
            key={ref}
            x1={0}
            x2={width}
            y1={at}
            y2={at}
            className="stroke-current text-gray-900 dark:text-gray-100"
            strokeOpacity={0.12}
          />
        );
      })}
      {marks.map((mark, i) => {
        if (!mark || Number.isNaN(geometry.x[i])) return null;
        if (world) {
          const middle = centerOf(geometry, i);
          return (
            <g key={i}>
              <rect
                x={middle - 0.5}
                y={height - 9}
                width={1}
                height={5}
                className="fill-current text-gray-500 dark:text-gray-400"
                opacity={0.6}
              />
              <circle
                cx={middle}
                cy={y(mark.value)}
                r={2.5}
                fill={mark.color}
                shapeRendering="auto"
              />
            </g>
          );
        }
        const top = Math.min(height - 1, Math.round(y(mark.value)));
        return (
          <g key={i}>
            <rect
              x={geometry.x[i]}
              y={top}
              width={geometry.bar}
              height={height - top}
              fill={mark.color}
            />
            {/* A color that would vanish into the ground gets a one-pixel cap, not an outline. */}
            {needsRim(mark.color, dark) && (
              <rect x={geometry.x[i]} y={top} width={geometry.bar} height={1} fill={rim} />
            )}
          </g>
        );
      })}
    </svg>
  );
});

/** The selected, hovered and open saves as rules through the row. */
export function Rules({
  geometry,
  height,
  selected,
  hovered,
  openColumn,
  dark,
}: {
  geometry: StripGeometry;
  height: number;
  selected: number;
  hovered: number | null;
  openColumn: number;
  dark: boolean;
}) {
  const color = dark ? ink.dark : ink.light;
  const line = (i: number, props: React.SVGProps<SVGLineElement>) =>
    Number.isNaN(geometry.x[i]) ? null : (
      <line
        x1={centerOf(geometry, i)}
        x2={centerOf(geometry, i)}
        y1={0}
        y2={height + 1}
        stroke={color}
        {...props}
      />
    );
  return (
    <>
      {openColumn >= 0 &&
        openColumn !== selected &&
        line(openColumn, { strokeDasharray: "3 3", strokeOpacity: 0.55 })}
      {hovered !== null && hovered !== selected && line(hovered, { strokeOpacity: 0.6 })}
      {line(selected, { strokeOpacity: 0.9 })}
    </>
  );
}

/**
 * The strokes at the read saves: the selected one wider and edged in the
 * rule's ink, the hovered one a step narrower with a cap at the pointer's
 * rule. A read stroke is at least four pixels tall so a small value shows.
 */
export function ReadMarks({
  marks,
  geometry,
  height,
  y,
  selected,
  hovered,
  world,
  dark,
}: {
  marks: readonly (Mark | null)[];
  geometry: StripGeometry;
  height: number;
  y: (value: number) => number;
  selected: number;
  hovered: number | null;
  world: boolean;
  dark: boolean;
}) {
  const color = dark ? ink.dark : ink.light;
  const read = [...new Set([hovered, selected])].filter((i): i is number => i !== null);
  return (
    <g shapeRendering="crispEdges">
      {read.map((i) => {
        const mark = marks[i];
        if (!mark || Number.isNaN(geometry.x[i])) return null;
        const chosen = i === selected;
        if (world) {
          return (
            <circle
              key={i}
              cx={centerOf(geometry, i)}
              cy={y(mark.value)}
              r={chosen ? 4.5 : 3.5}
              fill={mark.color}
              stroke={color}
              strokeOpacity={chosen ? 1 : 0.6}
              strokeWidth={1.5}
              shapeRendering="auto"
            />
          );
        }
        const wide = geometry.bar + (chosen ? 2 : 1);
        const left = geometry.x[i] - (chosen ? 1 : 0);
        const top = Math.min(Math.round(y(mark.value)), height - 4);
        return chosen ? (
          <rect
            key={i}
            x={left + 0.5}
            y={top + 0.5}
            width={wide - 1}
            height={height - top - 0.5}
            fill={mark.color}
            stroke={color}
            strokeWidth={1}
          />
        ) : (
          <g key={i}>
            <rect x={left} y={top} width={wide} height={height - top} fill={mark.color} />
            <rect x={left} y={top - 2} width={wide} height={2} fill={color} fillOpacity={0.6} />
          </g>
        );
      })}
    </g>
  );
}
