import React, { useMemo } from "react";
import { GameTabs, Skeleton } from "../../../components";
import { formatFloat } from "@/lib/format";
import type { MarketMemberCountry, MarketProfile as MarketProfileData } from "@/wasm/wasm_eu5";
import { MarketProductionLocations } from "../../insights/MarketProductionLocations";
import { CountryLink } from "../EntityLink";
import { MarketGoodsTabContent } from "./GoodsTab";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";
import { useProfileTab } from "../PanelNavContext";
import { LocationDistributionChart } from "../../insights/LocationDistributionChart";
import { bucketLocations } from "../../insights/bucketLocations";
import { StatPlate } from "../country/EconomyTab";
import { Eu5DataTable, Eu5MapDataTable } from "../../../components";
import { createColumnHelper } from "@/lib/tanstack-table";

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
    <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-panel border border-game-line-strong">
      <StatPlate label="Market Value" value={formatFloat(profile.marketValue, 1)} />
      <StatPlate
        label="Owner Country"
        value={
          profile.ownerCountry ? (
            <CountryLink country={profile.ownerCountry} size="md" backLabel={profile.header.name} />
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
    return <Skeleton className="h-64" />;
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
      membersColumnHelper.accessor((row) => row.country.country.name, {
        id: "country",
        sortFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Country", variant: "pin" }),
        cell: ({ row }) => (
          <CountryLink country={row.original.country} aligned backLabel={marketName} />
        ),
      }),
      membersColumnHelper.accessor("tradeAdvantage", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Advantage", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
      }),
      membersColumnHelper.accessor("tradeCapacity", {
        sortFn: "basic",
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
      getRowHoverTarget={(row) => ({
        kind: "country",
        countryIdx: row.country.country.key,
      })}
      initialSorting={[{ id: "tradeAdvantage", desc: true }]}
    />
  );
}
