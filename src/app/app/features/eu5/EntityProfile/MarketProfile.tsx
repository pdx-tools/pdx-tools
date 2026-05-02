import { GameTabs } from "../components";
import { formatFloat, formatInt } from "@/lib/format";
import type { MarketMemberCountry } from "@/wasm/wasm_eu5";
import { MarketProductionLocations } from "../features/charts/MarketProductionLocations";
import { EntityLink } from "./EntityLink";
import { MarketOverviewTabContent } from "./tabs/OverviewTab";
import { MarketGoodsTabContent } from "./tabs/EconomyTab";
import { useEu5Trigger } from "./useEu5Trigger";
import { ProfileSkeleton } from "./ProfileSkeleton";
import { useProfileTab } from "./PanelNavContext";

export function MarketProfile({ anchorLocationIdx }: { anchorLocationIdx: number }) {
  const profileTab = useProfileTab("market");
  const activeTab = profileTab.value;
  const { data: profile, loading } = useEu5Trigger(
    (engine) => engine.trigger.getMarketProfile(anchorLocationIdx),
    [anchorLocationIdx],
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
          <GameTabs.Trigger value="goods">Goods</GameTabs.Trigger>
          <GameTabs.Trigger value="locations">Locations</GameTabs.Trigger>
          <GameTabs.Trigger value="members">Members</GameTabs.Trigger>
        </GameTabs.List>
        <GameTabs.Content
          value="overview"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <MarketOverviewTabContent data={profile.overview} />
        </GameTabs.Content>
        <GameTabs.Content
          value="goods"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          {activeTab === "goods" && <MarketGoodsTabContent anchorLocationIdx={anchorLocationIdx} />}
        </GameTabs.Content>
        <GameTabs.Content
          value="locations"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          {activeTab === "locations" && (
            <MarketLocationsTabContent anchorLocationIdx={anchorLocationIdx} />
          )}
        </GameTabs.Content>
        <GameTabs.Content
          value="members"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <MarketMembers members={profile.memberCountries} />
        </GameTabs.Content>
      </GameTabs>
    </div>
  );
}

function MarketLocationsTabContent({ anchorLocationIdx }: { anchorLocationIdx: number }) {
  const { data: locations, loading } = useEu5Trigger(
    (engine) => engine.trigger.getMarketLocationsProfile(anchorLocationIdx),
    [anchorLocationIdx],
  );

  if (loading && !locations) {
    return <div className="h-64 animate-pulse rounded bg-game-panel-hover" />;
  }

  if (!locations || locations.length === 0) {
    return <p className="py-6 text-center text-sm text-game-ink-500">No production locations.</p>;
  }

  return <MarketProductionLocations locations={locations} />;
}

function MarketMembers({ members }: { members: MarketMemberCountry[] }) {
  if (members.length === 0) {
    return <p className="text-sm text-game-ink-500">No member countries.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {members.map((member) => (
        <div
          key={member.country.anchorLocationIdx}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-game-line bg-game-panel-hover px-3 py-2 text-sm"
        >
          <EntityLink entity={member.country} />
          <span className="font-mono text-xs text-game-ink-300">
            {formatInt(member.locationCount)} loc
          </span>
          <span className="font-mono text-xs text-game-ink-300">
            {formatFloat(member.development, 1)} dev
          </span>
        </div>
      ))}
    </div>
  );
}
