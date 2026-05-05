import { useEffectEvent } from "react";
import type { EntityKind } from "@/wasm/wasm_eu5";
import { useEu5Engine } from "./store";
import { usePanToEntity } from "./usePanToEntity";

export type { EntityKind };
export type EntityActivateTarget =
  | { kind: "country"; countryIdx: number; anchorLocationIdx: number }
  | { kind: "market"; marketId: number; anchorLocationIdx: number };
export type EntityActivateModifiers = { shiftKey: boolean; altKey: boolean };

export function useEu5EntityActivate() {
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();

  return useEffectEvent((target: EntityActivateTarget, modifiers: EntityActivateModifiers) => {
    const isCountry = target.kind === "country";
    const typedId = isCountry ? target.countryIdx : target.marketId;
    if (modifiers.shiftKey) {
      void (isCountry ? engine.trigger.addCountry(typedId) : engine.trigger.addMarket(typedId));
    } else if (modifiers.altKey) {
      void (isCountry
        ? engine.trigger.removeCountry(typedId)
        : engine.trigger.removeMarket(typedId));
    } else {
      void (isCountry
        ? engine.trigger.selectCountry(typedId)
        : engine.trigger.selectMarket(typedId));
      panToEntity(target.anchorLocationIdx);
    }
  });
}
