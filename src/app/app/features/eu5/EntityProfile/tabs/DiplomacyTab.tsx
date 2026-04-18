import { useEu5SelectionState } from "../../store";
import { useEu5Trigger } from "../useEu5Trigger";
import type { EntityRef } from "@/wasm/wasm_eu5";
import { EntityLink } from "../EntityLink";

export function DiplomacyTab({ anchorIdx }: { anchorIdx?: number } = {}) {
  const selection = useEu5SelectionState();
  const anchor = selection?.derivedEntityAnchor;

  const { data, loading } = useEu5Trigger(
    (engine) =>
      anchorIdx != null
        ? engine.trigger.getDiplomacySectionFor(anchorIdx)
        : engine.trigger.getDiplomacySection(),
    [anchor, anchorIdx],
  );

  if (loading && !data) {
    return <div className="h-24 animate-pulse rounded bg-white/5" />;
  }
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      {data.overlord && (
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Overlord
          </p>
          <EntityRefRow entityRef={data.overlord} />
        </div>
      )}
      {data.subjects.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Subjects ({data.subjects.length})
          </p>
          <div className="flex flex-col gap-1">
            {data.subjects.map((s) => (
              <EntityRefRow key={s.tag} entityRef={s} />
            ))}
          </div>
        </div>
      )}
      {!data.overlord && data.subjects.length === 0 && (
        <p className="text-sm text-slate-500">No diplomatic relations.</p>
      )}
    </div>
  );
}

function EntityRefRow({ entityRef }: { entityRef: EntityRef }) {
  return <EntityLink entity={entityRef} className="text-sm" />;
}
