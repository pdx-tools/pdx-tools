import { createContext, useCallback, useContext } from "react";
import { check } from "@/lib/isPresent";
import { hoi4 } from "../store";
import type { Entity, Hoi4World } from "./model";
import { entityKey } from "./model";
import type { MapMatch } from "../worker/types";

export const Hoi4WorldContext = createContext<Hoi4World | null>(null);

export function useWorld(): Hoi4World {
  return check(useContext(Hoi4WorldContext), "Missing HOI4 world");
}

/**
 * The props that make a row open an entity and light its land while the
 * pointer is over it. Map hover lights the row whose key matches.
 */
export function useLink() {
  const world = useWorld();
  const { open, setHover } = hoi4.useActions();
  const hoverKey = hoi4.useHoverKey();
  return useCallback(
    (entity: Entity) => {
      const key = entityKey(entity);
      return {
        hot: hoverKey === key,
        onOpen: () => open(entity),
        onHover: (on: boolean) => setHover(on ? { key, match: world.mapMatch(entity) } : null),
      };
    },
    [world, open, setHover, hoverKey],
  );
}

/** Hover props for a line that lights land but opens nothing */
export function useHoverOnly() {
  const { setHover } = hoi4.useActions();
  const hoverKey = hoi4.useHoverKey();
  return useCallback(
    (key: string, match: MapMatch) => ({
      hot: hoverKey === key,
      onHover: (on: boolean) => setHover(on ? { key, match } : null),
    }),
    [setHover, hoverKey],
  );
}
