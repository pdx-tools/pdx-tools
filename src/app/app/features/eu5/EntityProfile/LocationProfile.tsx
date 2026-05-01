import { Tabs } from "@/components/Tabs";
import { LocationOverviewTab } from "./tabs/LocationOverviewTab";
import { LocationEconomyTab } from "./tabs/LocationEconomyTab";
import { LocationPopulationTab } from "./tabs/LocationPopulationTab";
import { LocationHeaderView } from "./EntityHeader";
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
      <LocationHeaderView header={profile.header} />
      <Tabs
        value={profileTab.value}
        onValueChange={profileTab.onValueChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="shrink-0 border-b border-white/10 px-2">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="buildings">Buildings</Tabs.Trigger>
          <Tabs.Trigger value="population">Population</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <LocationOverviewTab profile={profile} />
        </Tabs.Content>
        <Tabs.Content
          value="buildings"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <LocationEconomyTab profile={profile} />
        </Tabs.Content>
        <Tabs.Content
          value="population"
          className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4"
        >
          <LocationPopulationTab profile={profile} />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
