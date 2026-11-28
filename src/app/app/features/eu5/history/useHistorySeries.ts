import { useMemo } from "react";
import type { CountryDimension, CountryMetric, MapMode, Series } from "@/wasm/wasm_eu5";
import type { QueryReply } from "@/features/campaign/analysis/session";
import { eu5Analysis } from "./analysisClient";
import type { HistoryDate } from "./exportHistoryCsv";
import { useHistory } from "./store";
import { useCampaignQuery } from "./useCampaignQuery";

export const marketChartMetrics = ["price", "supply", "demand", "stockpile"] as const;
export type MarketChartMetric = (typeof marketChartMetrics)[number];

type ModeQuerySpec = {
  metrics: readonly CountryMetric[];
  dimension?: CountryDimension;
};

const modeQueries: Record<MapMode, ModeQuerySpec> = {
  political: { metrics: ["population", "stateCapacity", "income"] },
  control: { metrics: ["development", "effectiveDevelopment"] },
  development: { metrics: ["development", "locations"] },
  stateEfficacy: { metrics: ["effectiveDevelopment", "development"] },
  wealth: { metrics: ["wealth", "locations"] },
  unrealizedTaxBase: { metrics: ["wealth", "tax"] },
  population: { metrics: ["population", "urbanPopulation"] },
  populationGrowth: { metrics: ["births", "population"] },
  buildingLevels: { metrics: ["buildingLevels", "buildingEmployment"], dimension: "building" },
  religion: { metrics: ["population"], dimension: "religion" },
  rgoLevel: { metrics: ["rgoLevels"], dimension: "material" },
  markets: { metrics: [] },
};

export type ModeHistoryData = {
  metrics: Partial<Record<CountryMetric, (number | null)[]>>;
  breakdown: Series<string>[];
};

export type MarketHistoryData = {
  metrics: Record<MarketChartMetric, Series<number>[]>;
  weightedPrice: (number | null)[] | null;
};

const EMPTY_DATES: HistoryDate[] = [];
const EMPTY_MODE_DATA: ModeHistoryData = { metrics: {}, breakdown: [] };
const EMPTY_MARKET_DATA: MarketHistoryData = {
  metrics: { price: [], supply: [], demand: [], stockpile: [] },
  weightedPrice: null,
};

function sameSnapshotIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function useAlignedDates(campaignId: string | null, snapshotIds: readonly string[]): HistoryDate[] {
  const snapshots = useHistory((state) => state.snapshots);
  return useMemo(() => {
    if (!campaignId || !snapshotIds.length) return EMPTY_DATES;
    const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
    const aligned: HistoryDate[] = [];
    for (const id of snapshotIds) {
      const snapshot = byId.get(id);
      if (!snapshot) return EMPTY_DATES;
      aligned.push({
        id: snapshot.id,
        date: snapshot.date,
        campaignId,
        gameVersion: snapshot.gameVersion,
        contentHash: snapshot.contentHash,
      });
    }
    return aligned;
  }, [campaignId, snapshotIds, snapshots]);
}

/** Query only the narrow country/world columns and breakdown needed for `mode`. */
export function useModeHistory(
  campaignId: string | null,
  mode: MapMode,
  countryId: number | undefined,
  requested = true,
) {
  const spec = modeQueries[mode];
  const metrics = useMemo<CountryMetric[]>(() => {
    const list = [...spec.metrics];
    if (mode === "political" && countryId !== undefined) list.push("greatPowerRank");
    return list;
  }, [spec, mode, countryId]);
  const dimension = spec.dimension;
  const queryKey = useMemo(
    () => ({ kind: "modeHistory", mode, countryId, metrics, dimension }),
    [mode, countryId, metrics, dimension],
  );
  const { result, snapshotIds, error, loading } = useCampaignQuery<ModeHistoryData>(
    campaignId,
    queryKey,
    async (campaignId, identity, sequence, ids): Promise<QueryReply<ModeHistoryData>> => {
      const selection = { kind: "ids" as const, ids };
      const metricPromises = metrics.map(async (metric) => {
        const reply =
          countryId === undefined
            ? await eu5Analysis.query({
                campaignId,
                selection,
                identity: `${identity}:${metric}`,
                sequence,
                query: { kind: "worldSeries", metric },
              })
            : await eu5Analysis.query({
                campaignId,
                selection,
                identity: `${identity}:${metric}`,
                sequence,
                query: { kind: "countrySeries", countryIds: [countryId], metric },
              });
        return { metric, reply };
      });
      const breakdownPromise = dimension
        ? eu5Analysis.query({
            campaignId,
            selection,
            identity: `${identity}:breakdown:${dimension}`,
            sequence,
            query: { kind: "countryBreakdown", countryId, dimension },
          })
        : Promise.resolve(null);

      const [metricReplies, breakdownReply] = await Promise.all([
        Promise.all(metricPromises),
        breakdownPromise,
      ]);

      const allReplies = [
        ...metricReplies.map(({ reply }) => reply),
        ...(breakdownReply ? [breakdownReply] : []),
      ];
      const first = allReplies[0];
      if (!first) {
        return {
          generation: eu5Analysis.generation(),
          identity,
          sequence,
          snapshotIds: [],
          outcome: { status: "ok", value: EMPTY_MODE_DATA },
        };
      }
      if (
        allReplies.some(
          (reply) =>
            reply.outcome.status !== "ok" ||
            reply.generation !== first.generation ||
            !sameSnapshotIds(reply.snapshotIds, first.snapshotIds),
        )
      ) {
        return {
          generation: first.generation,
          identity,
          sequence,
          snapshotIds: [],
          outcome: { status: "stale" },
        };
      }

      const values: Partial<Record<CountryMetric, (number | null)[]>> = {};
      for (const { metric, reply } of metricReplies) {
        if (reply.outcome.status !== "ok") continue;
        const raw = reply.outcome.value;
        if ("rows" in raw) {
          values[metric] = raw.rows.map((row) => row.value ?? null);
        } else {
          const row = raw[0];
          values[metric] = row
            ? row.values.map((value) => value ?? null)
            : first.snapshotIds.map(() => null);
        }
      }
      const breakdown = breakdownReply?.outcome.status === "ok" ? breakdownReply.outcome.value : [];
      return {
        generation: first.generation,
        identity,
        sequence,
        snapshotIds: first.snapshotIds,
        outcome: { status: "ok", value: { metrics: values, breakdown } },
      };
    },
    requested && (metrics.length > 0 || dimension !== undefined),
  );

  const dates = useAlignedDates(campaignId, snapshotIds);
  return {
    dates,
    data: result ?? EMPTY_MODE_DATA,
    error,
    loading,
  };
}

/** Query only the selected good and market centers via narrow market queries. */
export function useMarketHistory(
  campaignId: string | null,
  good: string | undefined,
  centers: number[],
  includeWeightedPrice: boolean,
  requested = true,
) {
  const queryKey = useMemo(
    () => ({ kind: "marketHistory", good, centers, includeWeightedPrice }),
    [good, centers, includeWeightedPrice],
  );
  const { result, snapshotIds, error, loading } = useCampaignQuery<MarketHistoryData>(
    campaignId,
    queryKey,
    async (campaignId, identity, sequence, ids): Promise<QueryReply<MarketHistoryData>> => {
      if (!good || !centers.length) {
        return {
          generation: eu5Analysis.generation(),
          identity,
          sequence,
          snapshotIds: [],
          outcome: { status: "ok", value: EMPTY_MARKET_DATA },
        };
      }
      const selection = { kind: "ids" as const, ids };
      const metricPromises = marketChartMetrics.map(async (metric) => ({
        metric,
        reply: await eu5Analysis.query({
          campaignId,
          selection,
          identity: `${identity}:${metric}`,
          sequence,
          query: { kind: "marketSeries", good, centers, metric },
        }),
      }));
      const weightedPromise = includeWeightedPrice
        ? eu5Analysis.query({
            campaignId,
            selection,
            identity: `${identity}:weighted`,
            sequence,
            query: { kind: "marketWeightedPrice", good, centers },
          })
        : Promise.resolve(null);

      const [metricReplies, weightedReply] = await Promise.all([
        Promise.all(metricPromises),
        weightedPromise,
      ]);

      const allReplies = [
        ...metricReplies.map(({ reply }) => reply),
        ...(weightedReply ? [weightedReply] : []),
      ];
      const first = allReplies[0];
      if (
        allReplies.some(
          (reply) =>
            reply.outcome.status !== "ok" ||
            reply.generation !== first.generation ||
            !sameSnapshotIds(reply.snapshotIds, first.snapshotIds),
        )
      ) {
        return {
          generation: first.generation,
          identity,
          sequence,
          snapshotIds: [],
          outcome: { status: "stale" },
        };
      }

      const metrics = {
        price: [] as Series<number>[],
        supply: [] as Series<number>[],
        demand: [] as Series<number>[],
        stockpile: [] as Series<number>[],
      };
      for (const { metric, reply } of metricReplies) {
        if (reply.outcome.status === "ok") {
          metrics[metric] = reply.outcome.value;
        }
      }
      const weightedPrice =
        weightedReply?.outcome.status === "ok"
          ? weightedReply.outcome.value.rows.map((row) => row.value ?? null)
          : null;
      return {
        generation: first.generation,
        identity,
        sequence,
        snapshotIds: first.snapshotIds,
        outcome: { status: "ok", value: { metrics, weightedPrice } },
      };
    },
    requested && !!good && centers.length > 0,
  );

  const dates = useAlignedDates(campaignId, snapshotIds);
  return {
    dates,
    data: result ?? EMPTY_MARKET_DATA,
    error,
    loading,
  };
}
