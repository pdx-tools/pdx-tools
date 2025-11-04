import type { MapMode } from "@/wasm/wasm_eu5";

export interface MapLegendData {
  mode: MapMode;
  minValue: number;
  maxValue: number;
  minLabel: string;
  maxLabel: string;
  midValue?: number;
  midLabel?: string;
}

interface MapLegendProps {
  data: MapLegendData;
}

// Color stops for standard gradient (dark red → brown → green)
const STANDARD_GRADIENT_COLORS = [
  "rgb(20, 5, 5)", // Dark red (min)
  "rgb(101, 67, 33)", // Brown (mid)
  "rgb(34, 139, 34)", // Green (max)
];

// Color stops for RGO 2-color gradient (brown → green)
const RGO_GRADIENT_COLORS = [
  "rgb(101, 67, 33)", // Brown (min)
  "rgb(34, 139, 34)", // Green (max)
];

const MAP_MODE_TITLES: Record<MapMode, string> = {
  political: "Political",
  control: "Control",
  development: "Development",
  population: "Population",
  markets: "Markets",
  rgoLevel: "RGO Level",
  buildingLevels: "Building Levels",
  possibleTax: "Possible Tax",
  religion: "Religion",
};

export function MapLegend({ data }: MapLegendProps) {
  const isRgoMode = data.mode === "rgoLevel";
  const gradientColors = isRgoMode
    ? RGO_GRADIENT_COLORS
    : STANDARD_GRADIENT_COLORS;
  const hasThreeStops = !isRgoMode && data.midValue !== undefined;

  // Create gradient background - reversed so max (green) is at top, min (red) is at bottom
  let gradientStops: string[];
  if (hasThreeStops) {
    gradientStops = [
      `${gradientColors[2]} 0%`, // Green at top (max)
      `${gradientColors[1]} 50%`, // Brown in middle
      `${gradientColors[0]} 100%`, // Dark red at bottom (min)
    ];
  } else {
    // For RGO: green at top, brown at bottom
    gradientStops = [
      `${gradientColors[gradientColors.length - 1]} 0%`, // Green at top (max)
      `${gradientColors[0]} 100%`, // Brown at bottom (min)
    ];
  }

  const gradientStyle = `linear-gradient(180deg, ${gradientStops.join(", ")})`;

  return (
    <div className="relative inline-block rounded-lg bg-slate-800/90 p-3 text-xs text-white shadow-lg backdrop-blur-sm">
      {/* Mode Title */}
      <div className="mb-2 font-semibold text-blue-300">
        {MAP_MODE_TITLES[data.mode]}
      </div>

      {/* Gradient Container */}
      <div className="flex items-end gap-2">
        {/* Vertical Gradient Bar */}
        <div
          className="rounded"
          style={{
            width: "20px",
            height: "150px",
            background: gradientStyle,
          }}
        />

        {/* Labels */}
        <div
          className="flex flex-col justify-between text-slate-300"
          style={{ height: "150px" }}
        >
          {/* Max Label (top) */}
          <div className="font-mono">
            <div className="text-xs">{data.maxLabel}</div>
          </div>

          {/* Mid Label */}
          {hasThreeStops && data.midLabel !== undefined && (
            <div className="text-center font-mono">
              <div className="text-xs">{data.midLabel}</div>
            </div>
          )}

          {/* Min Label (bottom) */}
          <div className="font-mono">
            <div className="text-xs">{data.minLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
