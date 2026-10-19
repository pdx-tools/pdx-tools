import { useContext } from "react";
import { CursorTooltip } from "@/components/CursorTooltip";
import type { CursorPosition } from "@/components/CursorTooltip";
import { Swatch } from "@/features/stack";
import type { ProvinceDetails } from "../worker/types";
import { Hoi4WorldContext } from "../view/context";

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
  const world = useContext(Hoi4WorldContext);
  const holder = province?.controller ?? province?.owner ?? null;
  const summary = holder ? world?.byTag.get(holder.tag) : undefined;
  const occupationIndex =
    province?.stateId != null ? world?.occupationOfState.get(province.stateId) : undefined;
  const occupation =
    occupationIndex !== undefined ? world?.overview.occupations[occupationIndex] : undefined;
  // Only an occupation record makes land occupied. A controller without
  // one is, for example, the other side of a civil war.
  const occupied =
    occupation && province?.controller && occupation.occupier === province.controller.tag;
  const faction = summary?.faction != null ? world?.overview.factions[summary.faction] : null;

  return (
    <CursorTooltip cursorRef={cursorRef} visible={province !== null}>
      {province ? (
        <div className="grid max-w-[280px] min-w-[170px] gap-1 rounded-[var(--radius-panel)] border border-game-line-strong bg-game-overlay px-2.5 py-2 text-[12px] text-game-ink-100 shadow-[0_10px_15px_-3px_rgb(0_0_0/0.35)] backdrop-blur-md">
          <p className="font-medium">{province.stateName ?? KIND_LABELS[province.kind]}</p>
          {province.owner ? (
            <p className="flex items-center gap-1.5">
              <Swatch color={province.owner.color} size={10} />
              {province.owner.name}
            </p>
          ) : province.stateName ? (
            <p className="text-game-ink-500">{KIND_LABELS[province.kind]}</p>
          ) : null}
          {province.controller ? (
            <p className="flex items-center gap-1.5">
              <Swatch color={province.controller.color} size={10} />
              <span>
                <span className="text-game-ink-500">
                  {occupied ? "Occupied by" : "Controlled by"}
                </span>{" "}
                {province.controller.name}
              </span>
            </p>
          ) : null}
          {summary && world ? (
            <p className="text-game-ink-500">
              {world.ideologyName(summary.ideology)}
              {faction ? ` · ${faction.name}` : ""}
            </p>
          ) : null}
          {occupied && occupation ? (
            <p className="font-game-num text-[11px] text-game-ink-300 tabular-nums">
              Resistance {Math.round(occupation.resistance)}% · Compliance{" "}
              {Math.round(occupation.compliance)}%
            </p>
          ) : null}
        </div>
      ) : null}
    </CursorTooltip>
  );
}
