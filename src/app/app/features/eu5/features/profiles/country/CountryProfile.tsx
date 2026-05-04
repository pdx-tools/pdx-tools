import { GameTabs } from "../../../components";
import { CountryOverviewTabContent } from "../OverviewTab";
import { CountryEconomyTabContent } from "./EconomyTab";
import { ReligionTabContent } from "./ReligionTab";
import { CountryPopulationTabContent } from "./PopulationTab";
import { LocationsTabContent } from "./LocationsTab";
import { DiplomacyTabContent } from "./DiplomacyTab";
import { useEu5MapMode } from "../../../store";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";
import { useProfileTab } from "../PanelNavContext";

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
      <GameTabs
        value={profileTab.value}
        onValueChange={profileTab.onValueChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <GameTabs.List className="shrink-0 px-2">
          <GameTabs.Trigger value="overview">Overview</GameTabs.Trigger>
          <GameTabs.Trigger value="economy">Economy</GameTabs.Trigger>
          <GameTabs.Trigger value="religion">Religion</GameTabs.Trigger>
          <GameTabs.Trigger value="population">Population</GameTabs.Trigger>
          <GameTabs.Trigger value="locations">Locations</GameTabs.Trigger>
          <GameTabs.Trigger value="diplomacy">Diplomacy</GameTabs.Trigger>
        </GameTabs.List>
        <GameTabs.Content
          value="overview"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <CountryOverviewTabContent
            data={profile.overview}
            locations={profile.locations.locations}
          />
        </GameTabs.Content>
        <GameTabs.Content
          value="economy"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <CountryEconomyTabContent
            data={profile.economy}
            locations={profile.locations.locations}
          />
        </GameTabs.Content>
        <GameTabs.Content
          value="religion"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <ReligionTabContent data={profile.religion} />
        </GameTabs.Content>
        <GameTabs.Content
          value="population"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <CountryPopulationTabContent
            anchorLocationIdx={anchorLocationIdx}
            locations={profile.locations.locations}
            historicalPopulation={profile.economy.historicalPopulation}
          />
        </GameTabs.Content>
        <GameTabs.Content
          value="locations"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <LocationsTabContent locations={profile.locations.locations} mode={mode} />
        </GameTabs.Content>
        <GameTabs.Content
          value="diplomacy"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <DiplomacyTabContent data={profile.diplomacy} />
        </GameTabs.Content>
      </GameTabs>
    </div>
  );
}
