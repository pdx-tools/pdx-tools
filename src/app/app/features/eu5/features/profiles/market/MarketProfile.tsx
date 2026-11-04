import React, { useMemo } from "react";
import { Skeleton } from "../../../components";
import { formatInt, formatMetric, formatFixed } from "@/lib/format";
import type { MarketMemberCountry, MarketProfile as MarketProfileData } from "@/wasm/wasm_eu5";
import { MarketProductionLocations } from "../../insights/MarketProductionLocations";
import { CountryLink } from "../EntityLink";
import { MarketGoodsTabContent, MarketTradeSummary } from "./GoodsTab";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";
import { usePanelNav, sectionEntry } from "../PanelNavContext";
import type { ProfileSection } from "../PanelNavContext";
import { EntityProfileTitle } from "../ProfileTitle";
import { Row } from "../../../stack/parts";
import { levelBody } from "../../../stack/levelBody";
import { LocationDistributionChart } from "../../insights/LocationDistributionChart";
import { bucketLocations } from "../../insights/bucketLocations";
import { StatPlate } from "../country/EconomyTab";
import { Eu5DataTable, Eu5MapDataTable } from "../../../components";
import { createColumnHelper } from "@/lib/tanstack-table";

/**
 * A market level. Without a section it is the overview, which opens the
 * market's locations and members as levels of their own.
 */
export function MarketProfile({
  marketId,
  section,
}: {
  marketId: number;
  section?: ProfileSection;
}) {
  const nav = usePanelNav();
  const { data: profile, loading } = useEu5Trigger(
    (engine) => engine.queries.getMarketProfile(marketId),
    [marketId],
  );

  if (loading && !profile) return <ProfileSkeleton />;
  if (!profile) return null;

  if (section === "locations") {
    return (
      <div className={levelBody}>
        <MarketLocationsTabContent
          marketId={marketId}
          locationMarketAccess={profile.locationMarketAccess}
          locationMarketAttraction={profile.locationMarketAttraction}
        />
      </div>
    );
  }
  if (section === "members") {
    return <MarketMembers members={profile.memberCountries} />;
  }
  if (section === "goods") {
    // The goods level sets its own insets: its rows run to the edge.
    return <MarketGoodsTabContent marketId={marketId} />;
  }

  const identity = {
    kind: "market" as const,
    market: { key: marketId, name: profile.header.name },
  };
  const open = (part: ProfileSection, label: string) =>
    nav.open(sectionEntry(identity, part, label));

  return (
    <>
      <EntityProfileTitle header={profile.header} />
      <Row
        name="Locations"
        value={formatInt(profile.locationMarketAccess.length)}
        onOpen={() => open("locations", "Locations")}
      />
      <Row
        name="Members"
        value={formatInt(profile.memberCountries.length)}
        onOpen={() => open("members", "Members")}
      />
      <Row name="Goods" onOpen={() => open("goods", "Goods")} />
      <div className={levelBody}>
        <MarketHeaderStats profile={profile} />
      </div>
      <MarketTradeSummary marketId={marketId} />
    </>
  );
}

function MarketHeaderStats({ profile }: { profile: MarketProfileData }) {
  return (
    <div className="grid grid-cols-2">
      <StatPlate label="Market Value" value={formatMetric(profile.marketValue)} />
      <StatPlate
        label="Owner Country"
        value={
          profile.ownerCountry ? <CountryLink country={profile.ownerCountry} size="md" /> : "—"
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
    (engine) => engine.queries.getMarketLocationsProfile(marketId),
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

function MarketMembers({ members }: { members: MarketMemberCountry[] }) {
  const columns = useMemo(
    () => [
      membersColumnHelper.accessor((row) => row.country.country.name, {
        id: "country",
        sortFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Country", variant: "pin" }),
        cell: ({ row }) => <CountryLink country={row.original.country} aligned />,
      }),
      membersColumnHelper.accessor("tradeAdvantage", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Advantage", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      membersColumnHelper.accessor("tradeCapacity", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Capacity", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [],
  );

  return (
    <Eu5MapDataTable
      flush
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
