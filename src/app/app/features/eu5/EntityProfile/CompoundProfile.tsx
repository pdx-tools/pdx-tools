import { useEffect, useMemo, useState } from "react";
import { Tabs } from "@/components/Tabs";
import type { EntityHeader } from "@/wasm/wasm_eu5";
import { EntityHeader as EntityHeaderView } from "./EntityHeader";
import { OverviewTab } from "./tabs/OverviewTab";
import { EconomyTab } from "./tabs/EconomyTab";
import { LocationsTab } from "./tabs/LocationsTab";
import { DiplomacyTab } from "./tabs/DiplomacyTab";

interface Props {
  header: EntityHeader;
  anchorIdx?: number;
}

type TabValue = "overview" | "economy" | "locations" | "diplomacy";

export function CompoundProfile({ header, anchorIdx }: Props) {
  const hasDiplomacy = header.kind === "country";
  const availableTabs = useMemo<TabValue[]>(
    () =>
      hasDiplomacy
        ? ["overview", "economy", "locations", "diplomacy"]
        : ["overview", "economy", "locations"],
    [hasDiplomacy],
  );
  const [tab, setTab] = useState<TabValue>("overview");

  useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab("overview");
    }
  }, [availableTabs, tab]);

  return (
    <div className="flex h-full flex-col">
      <EntityHeaderView header={header} />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabValue)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="shrink-0 border-b border-white/10 px-2">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="economy">Economy</Tabs.Trigger>
          <Tabs.Trigger value="locations">Locations</Tabs.Trigger>
          {hasDiplomacy && <Tabs.Trigger value="diplomacy">Diplomacy</Tabs.Trigger>}
        </Tabs.List>
        <Tabs.Content value="overview" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <OverviewTab anchorIdx={anchorIdx} />
        </Tabs.Content>
        <Tabs.Content value="economy" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <EconomyTab anchorIdx={anchorIdx} />
        </Tabs.Content>
        <Tabs.Content
          value="locations"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <LocationsTab anchorIdx={anchorIdx} />
        </Tabs.Content>
        {hasDiplomacy && (
          <Tabs.Content
            value="diplomacy"
            className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
          >
            <DiplomacyTab anchorIdx={anchorIdx} />
          </Tabs.Content>
        )}
      </Tabs>
    </div>
  );
}
