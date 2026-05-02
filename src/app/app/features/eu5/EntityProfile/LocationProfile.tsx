import { GameTabs } from "../components";
import { LocationOverviewTab } from "./tabs/LocationOverviewTab";
import { LocationEconomyTab } from "./tabs/LocationEconomyTab";
import { LocationPopulationTab } from "./tabs/LocationPopulationTab";
import { useProfileTab } from "./PanelNavContext";
import { useEu5Trigger } from "./useEu5Trigger";
import { ProfileSkeleton } from "./ProfileSkeleton";

interface Props {
  locationIdx: number;
}

export function LocationProfile({ locationIdx }: Props) {
  const profileTab = useProfileTab("location");
  const { data: profile, loading } = useEu5Trigger(
    (engine) => engine.trigger.getLocationProfile(locationIdx),
    [locationIdx],
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
          <GameTabs.Trigger value="buildings">Buildings</GameTabs.Trigger>
          <GameTabs.Trigger value="population">Population</GameTabs.Trigger>
        </GameTabs.List>
        <GameTabs.Content
          value="overview"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <LocationOverviewTab profile={profile} />
        </GameTabs.Content>
        <GameTabs.Content
          value="buildings"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <LocationEconomyTab profile={profile} />
        </GameTabs.Content>
        <GameTabs.Content
          value="population"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <LocationPopulationTab profile={profile} />
        </GameTabs.Content>
      </GameTabs>
    </div>
  );
}
