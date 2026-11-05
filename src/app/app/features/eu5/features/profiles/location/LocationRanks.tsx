import { cx } from "class-variance-authority";
import { formatInt, formatMetric } from "@/lib/format";
import type { LocationProfile, LocationRank, MapMode } from "@/wasm/wasm_eu5";
import { formatLegendValue } from "../../../control-panel/Legend/GradientLegend";
import { Finding } from "../../../stack/parts";
import { locationFinding, rankLabel, rankPosition } from "../../../stack/selection";

type Metric = { id: string; label: string; word: string; shown: string; rank: LocationRank };

/** The metric that the map shows leads, and the rest keep their order. */
const LEADS: Partial<Record<MapMode, string>> = {
  development: "development",
  stateEfficacy: "development",
  population: "population",
  populationGrowth: "population",
  wealth: "wealth",
  unrealizedTaxBase: "wealth",
  control: "control",
};

/**
 * Where a location stands, in its country and in the world, from all owned land of the
 * save. When tax base equals wealth there is no gap, so one row says both and says so.
 */
export function LocationRanksBlock({
  profile,
  mode,
}: {
  profile: LocationProfile;
  mode?: MapMode;
}) {
  const { stats, ranks, header } = profile;
  const noGap = stats.taxBase === stats.wealth;
  const metrics: Metric[] = [
    {
      id: "development",
      label: "Development",
      word: "development",
      shown: formatMetric(stats.development),
      rank: ranks.development,
    },
    {
      id: "population",
      label: "Population",
      word: "population",
      shown: formatInt(stats.population),
      rank: ranks.population,
    },
    noGap
      ? {
          id: "wealth",
          label: "Tax base and wealth",
          word: "wealth",
          shown: formatMetric(stats.wealth),
          rank: ranks.wealth,
        }
      : {
          id: "wealth",
          label: "Wealth",
          word: "wealth",
          shown: formatMetric(stats.wealth),
          rank: ranks.wealth,
        },
    ...(noGap
      ? []
      : [
          {
            id: "taxBase",
            label: "Tax base",
            word: "tax base",
            shown: formatMetric(stats.taxBase),
            rank: ranks.taxBase,
          },
        ]),
    {
      id: "control",
      label: "Control",
      word: "control",
      shown: formatLegendValue("control", stats.control),
      rank: ranks.control,
    },
  ];
  const lead = metrics.find((m) => m.id === (mode && LEADS[mode])) ?? metrics[0];
  const owner = header.owner?.country.name;
  return (
    <section>
      <Finding>
        {locationFinding(header.location.name, owner, lead.word, lead.rank, {
          world: ranks.worldCount,
          country: ranks.countryCount,
        })}
        {noGap ? " Tax base equals wealth, so there is no gap." : ""}
      </Finding>
      <div
        role="table"
        aria-label={`${header.location.name}: ranks`}
        className="px-3.5 pb-2 font-game-ui text-[12px]"
      >
        <div
          role="row"
          className="grid h-7 grid-cols-[minmax(0,1fr)_56px_56px_72px_56px] items-center gap-2 text-game-ink-500"
        >
          <span role="columnheader">Metric</span>
          <span role="columnheader" className="text-right">
            Value
          </span>
          <span role="columnheader" title={owner} className="truncate text-right">
            {owner ? "Country" : ""}
          </span>
          <span role="columnheader" aria-label="Place in the world, on a log scale" />
          <span role="columnheader" className="text-right">
            World
          </span>
        </div>
        {metrics.map((metric) => (
          <div
            key={metric.id}
            role="row"
            className={cx(
              "grid min-h-7 grid-cols-[minmax(0,1fr)_56px_56px_72px_56px] items-center gap-2 border-t border-game-line-faint",
              metric === lead && "font-medium text-game-ink-100",
            )}
          >
            <span role="rowheader" className="min-w-0 text-game-ink-100">
              {metric.label}
            </span>
            <span role="cell" className="text-right font-game-num text-game-ink-100 tabular-nums">
              {metric.shown}
            </span>
            <span role="cell" className="text-right font-game-num text-game-ink-300 tabular-nums">
              {rankLabel(metric.rank.country, metric.rank.countryTied)}
            </span>
            <span aria-hidden role="cell" className="relative h-px bg-game-ink-rule">
              <span
                className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-game-ink-100"
                style={{ left: `${rankPosition(metric.rank.world, ranks.worldCount) * 100}%` }}
              />
            </span>
            <span role="cell" className="text-right font-game-num text-game-ink-300 tabular-nums">
              {rankLabel(metric.rank.world, metric.rank.worldTied)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
