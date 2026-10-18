import { createContext, useContext } from "react";
import type { MapHistoryValue } from "./MapHistory";

export const MapHistoryContext = createContext<MapHistoryValue | null>(null);

/** The campaign history of the open save. Null when the feature is off or still loading. */
export function useMapHistory() {
  return useContext(MapHistoryContext);
}
