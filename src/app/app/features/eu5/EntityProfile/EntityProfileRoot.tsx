import { useEu5SelectionState } from "../store";
import { useEu5SelectionTrigger } from "./useEu5Trigger";
import { CompoundProfile } from "./CompoundProfile";
import { LeafProfile } from "./LeafProfile";

interface Props {
  anchorIdx?: number;
}

export function EntityProfileRoot({ anchorIdx }: Props = {}) {
  const selection = useEu5SelectionState();
  const anchor = selection?.derivedEntityAnchor;
  const focused = selection?.focusedLocation;
  const count = selection?.locationCount ?? 0;
  const standaloneLeafIdx = anchor == null && count === 1 ? selection?.firstLocationIdx : undefined;
  // In drill-in mode (anchorIdx set) always show compound profile, never leaf.
  const isLeaf = anchorIdx == null && (focused != null || standaloneLeafIdx != null);
  const leafIdx = focused ?? standaloneLeafIdx;

  const headerQuery = useEu5SelectionTrigger(
    (engine) => {
      if (anchorIdx != null) return engine.trigger.getEntityHeaderFor(anchorIdx);
      if (!isLeaf) return engine.trigger.getEntityHeader();
      return Promise.resolve(null);
    },
    [anchor, count, isLeaf, anchorIdx],
  );

  const leafQuery = useEu5SelectionTrigger(
    (engine) =>
      leafIdx != null && anchorIdx == null
        ? engine.trigger.getLocationProfile(leafIdx)
        : Promise.resolve(null),
    [leafIdx, anchorIdx],
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
  return <CompoundProfile header={headerQuery.data} anchorIdx={anchorIdx} />;
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
