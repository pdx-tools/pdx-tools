import { Tabs } from "@/components/Tabs";
import type { LocationProfile } from "@/wasm/wasm_eu5";
import { LocationOverviewTab } from "./tabs/LocationOverviewTab";
import { LocationEconomyTab } from "./tabs/LocationEconomyTab";
import { LeafHeader } from "./EntityHeader";
import { useEu5Engine } from "../store";

interface Props {
  profile: LocationProfile;
  showBreadcrumb: boolean;
  scopeName: string | undefined;
}

export function LeafProfile({ profile, showBreadcrumb, scopeName }: Props) {
  const engine = useEu5Engine();

  return (
    <div className="flex h-full flex-col">
      {showBreadcrumb && (
        <button
          type="button"
          onClick={() => void engine.trigger.clearFocus()}
          className="shrink-0 px-4 pt-3 pb-1 text-left text-xs text-sky-300 hover:text-sky-200"
        >
          ← {scopeName ?? "Back"}
        </button>
      )}
      <LeafHeader header={profile.header} />
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="shrink-0 border-b border-white/10 px-2">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="economy">Economy</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <LocationOverviewTab profile={profile} />
        </Tabs.Content>
        <Tabs.Content value="economy" className="min-h-0 flex-1 basis-0 overflow-y-auto px-4 py-4">
          <LocationEconomyTab profile={profile} />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
