import type { DiplomacySection, EntityRef } from "@/wasm/wasm_eu5";
import { EntityLink } from "../EntityLink";

export function DiplomacyTabContent({ data }: { data: DiplomacySection }) {
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
