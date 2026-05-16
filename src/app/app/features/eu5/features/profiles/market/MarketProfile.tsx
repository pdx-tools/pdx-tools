import React, { useMemo } from "react";
import { GameTabs } from "../../../components";
import { formatFloat } from "@/lib/format";
import type { MarketMemberCountry, MarketProfile as MarketProfileData } from "@/wasm/wasm_eu5";
import { MarketProductionLocations } from "../../insights/MarketProductionLocations";
import { EntityLink } from "../EntityLink";
import { MarketGoodsTabContent } from "./GoodsTab";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";
import { useProfileTab } from "../PanelNavContext";
import { LocationDistributionChart } from "../../insights/LocationDistributionChart";
import type { LocationDistribution } from "@/wasm/wasm_eu5";
import { StatPlate } from "../country/EconomyTab";
import { Eu5DataTable, Eu5MapDataTable } from "../../../components";
import { createColumnHelper } from "@tanstack/react-table";

export function MarketProfile({ marketId }: { marketId: number }) {
  const profileTab = useProfileTab("market");
  const activeTab = profileTab.value;
  const { data: profile, loading } = useEu5Trigger(
    (engine) => engine.trigger.getMarketProfile(marketId),
    [marketId],
  );

  if (loading && !profile) return <ProfileSkeleton />;
  if (!profile) return null;

  return (
    <div className="flex h-full flex-col">
      <GameTabs
        value={activeTab}
        onValueChange={profileTab.onValueChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <GameTabs.List className="shrink-0 px-2">
          <GameTabs.Trigger value="overview">Overview</GameTabs.Trigger>
          <GameTabs.Trigger value="locations">Locations</GameTabs.Trigger>
          <GameTabs.Trigger value="members">Members</GameTabs.Trigger>
        </GameTabs.List>
        <GameTabs.Content
          value="overview"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <MarketHeaderStats profile={profile} />
          {activeTab === "overview" && <MarketGoodsTabContent marketId={marketId} />}
        </GameTabs.Content>
        <GameTabs.Content
          value="locations"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          {activeTab === "locations" && (
            <MarketLocationsTabContent
              marketId={marketId}
              locationMarketAccess={profile.locationMarketAccess}
              locationMarketAttraction={profile.locationMarketAttraction}
            />
          )}
        </GameTabs.Content>
        <GameTabs.Content value="members" className="min-h-0 flex-1 basis-0 overflow-y-auto">
          <MarketMembers members={profile.memberCountries} marketName={profile.header.name} />
        </GameTabs.Content>
      </GameTabs>
    </div>
  );
}

function MarketHeaderStats({ profile }: { profile: MarketProfileData }) {
  return (
    <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-game-line-strong">
      <StatPlate label="Market Value" value={formatFloat(profile.marketValue, 1)} />
      <StatPlate
        label="Owner Country"
        value={
          profile.ownerCountry ? (
            <EntityLink entity={profile.ownerCountry} size="md" backLabel={profile.header.name} />
          ) : (
            "—"
          )
        }
      />
    </div>
  );
}

function MarketLocationsTabContent({
  marketId,
  locationMarketAccess,
  locationMarketAttraction,
}: {
  marketId: number;
  locationMarketAccess: number[];
  locationMarketAttraction: number[];
}) {
  const { data: locations, loading } = useEu5Trigger(
    (engine) => engine.trigger.getMarketLocationsProfile(marketId),
    [marketId],
  );

  const accessDistribution =
    locationMarketAccess.length >= 5
      ? bucketLocations(
          "Market Access (%)",
          locationMarketAccess.map((v) => v * 100),
        )
      : null;
  const attractionDistribution =
    locationMarketAttraction.length >= 5
      ? bucketLocations(
          "Market Attraction (%)",
          locationMarketAttraction.map((v) => v * 100),
        )
      : null;

  if (loading && !locations) {
    return <div className="h-64 animate-pulse rounded bg-game-panel-hover" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {accessDistribution && <LocationDistributionChart distribution={accessDistribution} />}
      {attractionDistribution && (
        <LocationDistributionChart distribution={attractionDistribution} />
      )}
      {!locations || locations.length === 0 ? (
        <p className="py-6 text-center text-sm text-game-ink-500">No production locations.</p>
      ) : (
        <MarketProductionLocations locations={locations} />
      )}
    </div>
  );
}

const membersColumnHelper = createColumnHelper<MarketMemberCountry>();

function MarketMembers({
  members,
  marketName,
}: {
  members: MarketMemberCountry[];
  marketName: string;
}) {
  const columns = useMemo(
    () => [
      membersColumnHelper.accessor((row) => row.country.name, {
        id: "country",
        sortingFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Country", variant: "pin" }),
        cell: ({ row }) => (
          <EntityLink entity={row.original.country} aligned backLabel={marketName} />
        ),
      }),
      membersColumnHelper.accessor("tradeAdvantage", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Advantage", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
      }),
      membersColumnHelper.accessor("tradeCapacity", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Capacity", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [marketName],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={members}
      getRowHoverTarget={(row) =>
        row.country.kind === "country"
          ? { kind: "country", countryIdx: row.country.countryIdx }
          : { kind: "market", marketId: row.country.marketId }
      }
      initialSorting={[{ id: "tradeAdvantage", desc: true }]}
    />
  );
}

function bucketLocations(metricLabel: string, values: number[]): LocationDistribution {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return { metricLabel, buckets: [], topLocations: [] };
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (Math.abs(max - min) < Number.EPSILON) {
    return {
      metricLabel,
      buckets: [{ lo: min, hi: max, count: finiteValues.length }],
      topLocations: [],
    };
  }

  const targetBuckets = 20;
  const step = niceBucketStep(max - min, targetBuckets);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const bucketCount = Math.max(1, Math.min(targetBuckets * 2, Math.ceil((end - start) / step)));
  const counts = Array.from({ length: bucketCount }, () => 0);

  for (const value of finiteValues) {
    const index = Math.min(bucketCount - 1, Math.floor((value - start) / step));
    counts[index] += 1;
  }

  return {
    metricLabel,
    buckets: counts.map((count, index) => ({
      lo: start + index * step,
      hi: start + (index + 1) * step,
      count,
    })),
    topLocations: [],
  };
}

function niceBucketStep(range: number, targetBuckets: number): number {
  const rawStep = range / Math.max(1, targetBuckets);
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}
