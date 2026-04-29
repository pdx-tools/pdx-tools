import { useEffectEvent } from "react";
import type { EntityKind } from "@/wasm/wasm_eu5";
import { useEu5Engine } from "./store";
import { usePanToEntity } from "./usePanToEntity";

export type { EntityKind };
export type EntityActivateTarget = { kind: EntityKind; anchorLocationIdx: number };
export type EntityActivateModifiers = { shiftKey: boolean; altKey: boolean };

export function useEu5EntityActivate() {
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();

  return useEffectEvent((target: EntityActivateTarget, modifiers: EntityActivateModifiers) => {
    const idx = target.anchorLocationIdx;
    const isCountry = target.kind === "country";
    if (modifiers.shiftKey) {
      void (isCountry ? engine.trigger.addCountry(idx) : engine.trigger.addMarket(idx));
    } else if (modifiers.altKey) {
      void (isCountry ? engine.trigger.removeCountry(idx) : engine.trigger.removeMarket(idx));
    } else {
      void (isCountry ? engine.trigger.selectCountry(idx) : engine.trigger.selectMarket(idx));
      panToEntity(idx);
    }
  });
}
