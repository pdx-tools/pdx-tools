import { useEu5SelectionState } from "../store";
import { useEu5Trigger } from "./useEu5Trigger";
import { CompoundProfile } from "./CompoundProfile";
import { LeafProfile } from "./LeafProfile";

export function EntityProfileRoot() {
  const selection = useEu5SelectionState();
  const anchor = selection?.derivedEntityAnchor;
  const focused = selection?.focusedLocation;
  const count = selection?.locationCount ?? 0;
  const standaloneLeafIdx = anchor == null && count === 1 ? selection?.firstLocationIdx : undefined;
  const isLeaf = focused != null || standaloneLeafIdx != null;
  const leafIdx = focused ?? standaloneLeafIdx;

  const headerQuery = useEu5Trigger(
    (engine) => (!isLeaf ? engine.trigger.getEntityHeader() : Promise.resolve(null)),
    [anchor, count, isLeaf],
  );

  const leafQuery = useEu5Trigger(
    (engine) =>
      leafIdx != null ? engine.trigger.getLocationProfile(leafIdx) : Promise.resolve(null),
    [leafIdx],
  );

  if (isLeaf) {
    if (leafQuery.loading && !leafQuery.data) return <ProfileSkeleton />;
    if (!leafQuery.data) return null;
    return (
      <LeafProfile
        profile={leafQuery.data}
        showBreadcrumb={focused != null}
        scopeName={selection?.scopeDisplayName}
      />
    );
  }

  if (headerQuery.loading && !headerQuery.data) return <ProfileSkeleton />;
  if (!headerQuery.data) return null;
  return <CompoundProfile header={headerQuery.data} />;
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="h-16 animate-pulse rounded-lg bg-white/5" />
      <div className="h-8 animate-pulse rounded bg-white/5" />
      <div className="h-32 animate-pulse rounded bg-white/5" />
    </div>
  );
}
