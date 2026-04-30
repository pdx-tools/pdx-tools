import { Tabs } from "@/components/Tabs";
import { EntityHeader } from "./EntityHeader";
import { CountryOverviewTabContent } from "./tabs/OverviewTab";
import { CountryEconomyTabContent } from "./tabs/EconomyTab";
import { ReligionTabContent } from "./tabs/ReligionTab";
import { CountryPopulationTabContent } from "./tabs/PopulationTab";
import { LocationsTabContent } from "./tabs/LocationsTab";
import { DiplomacyTabContent } from "./tabs/DiplomacyTab";
import { useEu5MapMode } from "../store";
import { useEu5Trigger } from "./useEu5Trigger";
import { ProfileSkeleton } from "./ProfileSkeleton";
import { useProfileTab } from "./PanelNavContext";

export function CountryProfile({ anchorLocationIdx }: { anchorLocationIdx: number }) {
  const mode = useEu5MapMode();
  const profileTab = useProfileTab("country");
  const { data: profile, loading } = useEu5Trigger(
    (engine) => engine.trigger.getCountryProfile(anchorLocationIdx),
    [anchorLocationIdx],
  );

  if (loading && !profile) return <ProfileSkeleton />;
  if (!profile) return null;

  return (
    <div className="flex h-full flex-col">
      <EntityHeader header={profile.header} />
      <Tabs
        value={profileTab.value}
        onValueChange={profileTab.onValueChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="shrink-0 border-b border-white/10 px-2">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="economy">Economy</Tabs.Trigger>
          <Tabs.Trigger value="religion">Religion</Tabs.Trigger>
          <Tabs.Trigger value="population">Population</Tabs.Trigger>
          <Tabs.Trigger value="locations">Locations</Tabs.Trigger>
          <Tabs.Trigger value="diplomacy">Diplomacy</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <CountryOverviewTabContent
            data={profile.overview}
            locations={profile.locations.locations}
          />
        </Tabs.Content>
        <Tabs.Content value="economy" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <CountryEconomyTabContent
            data={profile.economy}
            locations={profile.locations.locations}
          />
        </Tabs.Content>
        <Tabs.Content value="religion" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <ReligionTabContent data={profile.religion} />
        </Tabs.Content>
        <Tabs.Content
          value="population"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <CountryPopulationTabContent
            anchorLocationIdx={anchorLocationIdx}
            locations={profile.locations.locations}
          />
        </Tabs.Content>
        <Tabs.Content
          value="locations"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <LocationsTabContent locations={profile.locations.locations} mode={mode} />
        </Tabs.Content>
        <Tabs.Content
          value="diplomacy"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <DiplomacyTabContent data={profile.diplomacy} />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
