import { useMapHistory } from "../../history/MapHistory";
import { usePanelNav, entityProfileEntry, locationProfileEntry } from "./PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
/** Resolve snapshot-local identities only after the correct original save is open. */
export function useAnalysisEntityNavigation() {
  const history = useMapHistory(),
    nav = usePanelNav(),
    pan = usePanToEntity();
  return async (
    kind: "country" | "market" | "location",
    id: number,
    label: string,
    anchor: number,
    backLabel?: string,
  ) => {
    if (history?.preview) {
      const resolved = await history.inspectEntity({ kind, id });
      if (!resolved) return;
      const target =
        resolved.kind === "country"
          ? resolved.country
          : resolved.kind === "market"
            ? resolved.market
            : resolved.location;
      nav.pushMany(
        [
          resolved.kind === "location"
            ? locationProfileEntry(target.key, target.name)
            : entityProfileEntry(resolved.kind, target.key, target.name),
        ],
        backLabel,
      );
    } else
      nav.pushMany(
        [
          kind === "location"
            ? locationProfileEntry(id, label)
            : entityProfileEntry(kind, id, label),
        ],
        backLabel,
      );
    pan(anchor);
  };
}
