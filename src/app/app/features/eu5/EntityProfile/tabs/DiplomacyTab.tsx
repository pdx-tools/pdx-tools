import type {
  DiplomacySection,
  DiplomacySubjectType,
  EntityRef,
  SubjectRef,
} from "@/wasm/wasm_eu5";
import { EntityLink } from "../EntityLink";

const PLURAL: Partial<Record<DiplomacySubjectType, string>> = {
  Tributary: "Tributaries",
  March: "Marches",
  "Hanseatic Member": "Hanseatic Members",
  "Maha Samanta": "Maha Samantas",
};

function pluralize(type: DiplomacySubjectType, count: number): string {
  const base = count > 1 ? (PLURAL[type] ?? `${type}s`) : type;
  return count > 1 ? `${base} (${count})` : base;
}

export function DiplomacyTabContent({ data }: { data: DiplomacySection }) {
  const grouped = new Map<DiplomacySubjectType, SubjectRef[]>();
  for (const s of data.subjects) {
    const group = grouped.get(s.subjectType) ?? [];
    group.push(s);
    grouped.set(s.subjectType, group);
  }

  return (
    <div className="flex flex-col gap-4">
      {data.overlord && (
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Overlord
          </p>
          <EntityRefRow
            entityRef={data.overlord}
            label={data.overlordSubjectType ? `${data.overlordSubjectType} of` : undefined}
          />
        </div>
      )}
      {[...grouped.entries()].map(([type, subjects]) => (
        <div key={type}>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            {pluralize(type, subjects.length)}
          </p>
          <div className="flex flex-col gap-1">
            {subjects.map((s) => (
              <EntityRefRow key={s.entity.tag} entityRef={s.entity} />
            ))}
          </div>
        </div>
      ))}
      {!data.overlord && data.subjects.length === 0 && (
        <p className="text-sm text-slate-500">No diplomatic relations.</p>
      )}
    </div>
  );
}

function EntityRefRow({ entityRef, label }: { entityRef: EntityRef; label?: string }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      {label && <span className="text-slate-500">{label}</span>}
      <EntityLink entity={entityRef} className="text-sm" />
    </div>
  );
}
