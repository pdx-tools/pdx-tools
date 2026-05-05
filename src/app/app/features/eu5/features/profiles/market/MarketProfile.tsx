import React from "react";
import { GameTabs } from "../../../components";
import { formatFloat } from "@/lib/format";
import type { MarketMemberCountry, MarketProfile as MarketProfileData } from "@/wasm/wasm_eu5";
import { MarketProductionLocations } from "../../insights/MarketProductionLocations";
import { EntityLink } from "../EntityLink";
import { MarketGoodsTabContent } from "./GoodsTab";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";
import { useProfileTab } from "../PanelNavContext";
import { Tooltip } from "@/components/Tooltip";
import { LocationDistributionChart } from "../../insights/LocationDistributionChart";
import type { LocationDistribution } from "@/wasm/wasm_eu5";
import { StatPlate } from "../country/EconomyTab";

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

const MEMBERS_COLUMNS = "1fr 96px 96px";

function MarketMembers({
  members,
  marketName,
}: {
  members: MarketMemberCountry[];
  marketName: string;
}) {
  if (members.length === 0) {
    return <p className="px-4 py-4 text-sm text-game-ink-500">No member countries.</p>;
  }

  return (
    <div className="flex flex-col">
      <div
        className="grid h-[26px] items-center border-b border-game-line-strong px-3"
        style={{ gridTemplateColumns: MEMBERS_COLUMNS }}
      >
        <span className="font-game-num text-[10px] tracking-[.14em] text-game-ink-700 uppercase">
          Country
        </span>
        <MemberHeaderCell tooltip="Trade advantage determines the order in which countries fulfill their exports within a market. When goods are scarce, they are distributed according to each country's trade advantage.">
          Advantage
        </MemberHeaderCell>
        <MemberHeaderCell tooltip="Trade capacity represents the capacity of merchants to move goods between markets. It is primarily provided by trade buildings and is consumed by trades based in this market.">
          Capacity
        </MemberHeaderCell>
      </div>
      {members.map((member) => (
        <div
          key={
            member.country.kind === "country" ? member.country.countryIdx : member.country.marketId
          }
          className="grid h-7 items-center border-b border-game-line px-3"
          style={{ gridTemplateColumns: MEMBERS_COLUMNS }}
        >
          <EntityLink entity={member.country} size="md" backLabel={marketName} />
          <MemberMetricCell>{formatFloat(member.tradeAdvantage, 2)}</MemberMetricCell>
          <MemberMetricCell>{formatFloat(member.tradeCapacity, 2)}</MemberMetricCell>
        </div>
      ))}
    </div>
  );
}

function MemberMetricCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate text-right font-game-num text-xs text-game-ink-100 tabular-nums">
      {children}
    </span>
  );
}

function MemberHeaderCell({ children, tooltip }: { children: React.ReactNode; tooltip: string }) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span className="cursor-help text-right font-game-num text-[10px] tracking-[.14em] text-game-ink-700 uppercase decoration-dotted underline-offset-2 hover:text-game-ink-500 hover:underline">
          {children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="max-w-72 text-xs normal-case">
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
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
