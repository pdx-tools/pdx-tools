import React from "react";
import { GameTabs } from "../../../components";
import { formatFloat } from "@/lib/format";
import type { MarketMemberCountry } from "@/wasm/wasm_eu5";
import { MarketProductionLocations } from "../../insights/MarketProductionLocations";
import { EntityLink } from "../EntityLink";
import { MarketOverviewTabContent } from "../OverviewTab";
import { MarketGoodsTabContent } from "./GoodsTab";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";
import { useProfileTab } from "../PanelNavContext";
import { Tooltip } from "@/components/Tooltip";

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
        <GameTabs.Content value="members" className="min-h-0 flex-1 basis-0 overflow-y-auto">
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

const MEMBERS_COLUMNS = "1fr 96px 96px";

function MarketMembers({ members }: { members: MarketMemberCountry[] }) {
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
          key={member.country.anchorLocationIdx}
          className="grid h-7 items-center border-b border-game-line px-3"
          style={{ gridTemplateColumns: MEMBERS_COLUMNS }}
        >
          <EntityLink entity={member.country} size="md" static />
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
