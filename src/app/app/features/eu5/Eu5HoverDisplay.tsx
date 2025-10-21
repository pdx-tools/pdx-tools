import { formatFloat, formatInt } from "@/lib/format";
import { useEu5HoverData } from "./store";

export function Eu5HoverDisplay() {
  const hoverData = useEu5HoverData();

  if (!hoverData || hoverData.kind === "clear") {
    return null;
  }

  if (hoverData.kind === "location") {
    return (
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-slate-800/90 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm">
        <div className="font-semibold text-blue-300">
          {hoverData.locationName}
        </div>
        {hoverData.development !== undefined && (
          <div className="mt-1">
            Development:{" "}
            <span className="font-mono text-yellow-300">
              {formatFloat(hoverData.development, 2)}
            </span>
          </div>
        )}
        {hoverData.population !== undefined && (
          <div className="mt-1">
            Population:{" "}
            <span className="font-mono text-green-300">
              {formatInt(hoverData.population)}
            </span>
          </div>
        )}
        {hoverData.rgoLevel !== undefined && (
          <div className="mt-1">
            RGO Level:{" "}
            <span className="font-mono text-orange-300">
              {formatInt(hoverData.rgoLevel)}
            </span>
          </div>
        )}
        {hoverData.controlValue !== undefined && (
          <div className="mt-1">
            Control:{" "}
            <span className="font-mono text-purple-300">
              {formatFloat(hoverData.controlValue * 100, 2)}%
            </span>
          </div>
        )}
        {hoverData.buildingLevel !== undefined && (
          <div className="mt-1">
            Building Levels:{" "}
            <span className="font-mono text-cyan-300">
              {formatInt(hoverData.buildingLevel)}
            </span>
          </div>
        )}
        {hoverData.marketAccess !== undefined && (
          <div className="mt-1">
            Market Access:{" "}
            <span className="font-mono text-indigo-300">
              {formatInt(hoverData.marketAccess * 100)}%
            </span>
          </div>
        )}
        {hoverData.possibleTax !== undefined && (
          <div className="mt-1">
            Possible Tax:{" "}
            <span className="font-mono text-red-300">
              {formatFloat(hoverData.possibleTax, 2)}
            </span>
          </div>
        )}
        {hoverData.locationReligionName !== undefined && (
          <div className="mt-1">
            Location Religion:{" "}
            <span className="font-mono text-amber-300">
              {hoverData.locationReligionName}
            </span>
          </div>
        )}
        {hoverData.ownerReligionName !== undefined && (
          <div className="mt-1">
            Owner Religion:{" "}
            <span className="font-mono text-pink-300">
              {hoverData.ownerReligionName}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (hoverData.kind === "country") {
    return (
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-slate-800/90 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm">
        <div className="font-semibold text-blue-300">
          {hoverData.marketCenterName || hoverData.countryName}
          {!hoverData.marketCenterName && (
            <span className="ml-2 text-xs text-slate-400">
              ({hoverData.countryTag})
            </span>
          )}
        </div>
        {hoverData.totalDevelopment !== undefined && (
          <div className="mt-1">
            Total Development:{" "}
            <span className="font-mono text-yellow-300">
              {formatFloat(hoverData.totalDevelopment, 2)}
            </span>
          </div>
        )}
        {hoverData.totalPopulation !== undefined && (
          <div className="mt-1">
            Total Population:{" "}
            <span className="font-mono text-green-300">
              {formatInt(hoverData.totalPopulation)}
            </span>
          </div>
        )}
        {hoverData.totalRgoLevel !== undefined && (
          <div className="mt-1">
            Total RGO Levels:{" "}
            <span className="font-mono text-orange-300">
              {formatInt(hoverData.totalRgoLevel)}
            </span>
          </div>
        )}
        {hoverData.averageControlValue !== undefined && (
          <div className="mt-1">
            Average Control:{" "}
            <span className="font-mono text-purple-300">
              {formatFloat(hoverData.averageControlValue * 100, 2)}%
            </span>
          </div>
        )}
        {hoverData.totalBuildingLevels !== undefined && (
          <div className="mt-1">
            Total Building Levels:{" "}
            <span className="font-mono text-cyan-300">
              {formatInt(hoverData.totalBuildingLevels)}
            </span>
          </div>
        )}
        {hoverData.marketValue !== undefined && (
          <div className="mt-1">
            Market Value:{" "}
            <span className="font-mono text-pink-300">
              {formatFloat(hoverData.marketValue, 2)}
            </span>
          </div>
        )}
        {hoverData.totalPossibleTax !== undefined && (
          <div className="mt-1">
            Total Possible Tax:{" "}
            <span className="font-mono text-red-300">
              {formatFloat(hoverData.totalPossibleTax, 2)}
            </span>
          </div>
        )}
        {hoverData.countryReligionName !== undefined && (
          <div className="mt-1">
            Religion:{" "}
            <span className="font-mono text-amber-300">
              {hoverData.countryReligionName}
            </span>
          </div>
        )}
      </div>
    );
  }

  return null;
}
