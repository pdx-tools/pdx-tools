import { CursorTooltip } from "@/components/CursorTooltip";
import type { CursorPosition } from "@/components/CursorTooltip";
import type { ProvinceDetails } from "../worker/types";
import { CountrySwatch } from "../components/CountrySelect";

const KIND_LABELS: Record<ProvinceDetails["kind"], string> = {
  land: "Unowned",
  sea: "Sea",
  lake: "Lake",
  impassable: "Impassable",
};

export function ProvinceTooltip({
  cursorRef,
  province,
}: {
  cursorRef: React.RefObject<CursorPosition>;
  province: ProvinceDetails | null;
}) {
  return (
    <CursorTooltip cursorRef={cursorRef} visible={province !== null}>
      {province ? (
        <div className="max-w-72 rounded-md border border-black/10 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-lg dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-100">
          <p className="font-semibold">
            {province.stateName ?? KIND_LABELS[province.kind]}
            <span className="ml-2 text-xs font-normal opacity-60">#{province.provinceId}</span>
          </p>
          {province.owner ? (
            <p className="mt-1 flex items-center">
              <CountrySwatch color={province.owner.color} />
              {province.owner.name}
            </p>
          ) : province.stateName ? (
            <p className="mt-1 opacity-70">{KIND_LABELS[province.kind]}</p>
          ) : null}
          {province.controller ? (
            <p className="mt-1 flex items-center">
              <CountrySwatch color={province.controller.color} />
              Occupied by {province.controller.name}
            </p>
          ) : null}
        </div>
      ) : null}
    </CursorTooltip>
  );
}
