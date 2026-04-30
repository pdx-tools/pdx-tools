import { useState } from "react";
import { Tabs } from "@/components/Tabs";
import { formatFloat, formatInt } from "@/lib/format";
import type { MarketMemberCountry } from "@/wasm/wasm_eu5";
import { EntityHeader } from "./EntityHeader";
import { EntityLink } from "./EntityLink";
import { MarketOverviewTabContent } from "./tabs/OverviewTab";
import { MarketGoodsTabContent } from "./tabs/EconomyTab";
import { LocationsTabContent } from "./tabs/LocationsTab";
import { useEu5MapMode } from "../store";
import { useEu5Trigger } from "./useEu5Trigger";
import { ProfileSkeleton } from "./ProfileSkeleton";

export function MarketProfile({ anchorLocationIdx }: { anchorLocationIdx: number }) {
  const mode = useEu5MapMode();
  const [tabState, setTabState] = useState({ anchorLocationIdx, value: "overview" });
  const activeTab = tabState.anchorLocationIdx === anchorLocationIdx ? tabState.value : "overview";
  const { data: profile, loading } = useEu5Trigger(
    (engine) => engine.trigger.getMarketProfile(anchorLocationIdx),
    [anchorLocationIdx],
  );

  if (loading && !profile) return <ProfileSkeleton />;
  if (!profile) return null;

  return (
    <div className="flex h-full flex-col">
      <EntityHeader header={profile.header} />
      <Tabs
        value={activeTab}
        onValueChange={(value) => setTabState({ anchorLocationIdx, value })}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="shrink-0 border-b border-white/10 px-2">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="goods">Goods</Tabs.Trigger>
          <Tabs.Trigger value="locations">Locations</Tabs.Trigger>
          <Tabs.Trigger value="members">Members</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <MarketOverviewTabContent data={profile.overview} />
        </Tabs.Content>
        <Tabs.Content value="goods" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          {activeTab === "goods" && <MarketGoodsTabContent anchorLocationIdx={anchorLocationIdx} />}
        </Tabs.Content>
        <Tabs.Content
          value="locations"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <LocationsTabContent locations={profile.locations.locations} mode={mode} />
        </Tabs.Content>
        <Tabs.Content value="members" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <MarketMembers members={profile.memberCountries} />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}

function MarketMembers({ members }: { members: MarketMemberCountry[] }) {
  if (members.length === 0) {
    return <p className="text-sm text-slate-500">No member countries.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {members.map((member) => (
        <div
          key={member.country.anchorLocationIdx}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm"
        >
          <EntityLink entity={member.country} />
          <span className="font-mono text-xs text-slate-400">
            {formatInt(member.locationCount)} loc
          </span>
          <span className="font-mono text-xs text-slate-400">
            {formatFloat(member.development, 1)} dev
          </span>
        </div>
      ))}
    </div>
  );
}
