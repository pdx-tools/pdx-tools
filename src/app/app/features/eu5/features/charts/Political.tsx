import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { EntityProfileRoot } from "../../EntityProfile";

export function PoliticalInsight() {
  const query = useEu5SelectionTrigger((engine) =>
    engine.trigger.getPoliticalDefaultCountryAnchor(),
  );

  if (query.loading && query.data == null) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="h-16 animate-pulse rounded-lg bg-white/5" />
        <div className="h-8 animate-pulse rounded bg-white/5" />
        <div className="h-32 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (query.data == null) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-slate-500">
        No insight available for this view.
      </div>
    );
  }

  return (
    <EntityProfileRoot identity={{ kind: "country", anchor_location_idx: query.data, label: "" }} />
  );
}
