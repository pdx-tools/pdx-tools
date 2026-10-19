import { useMapHistory } from "../../history/context";
import { usePanelNav, entityProfileEntry, locationProfileEntry } from "./PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { useCampaign } from "@/features/campaign/CampaignProvider";
import { activeEu5Store } from "../../store";
import { openPreview, usePreviewSession } from "../../history/previewSession";
/** Resolve snapshot-local identities only after the correct original save is open. */
export function useAnalysisEntityNavigation() {
  const history = useMapHistory(),
    campaign = useCampaign(),
    nav = usePanelNav(),
    pan = usePanToEntity();
  return async (
    kind: "country" | "market" | "location",
    id: number,
    label: string,
    anchor: number,
    backLabel?: string,
    remove = false,
  ) => {
    if (history?.preview) {
      if (!campaign || !history.preview.shown) return;
      if (!(await openPreview(campaign, { entity: { kind, id }, remove }))) return;
      if (remove) return;
      if (usePreviewSession.getState().kind !== "live") return;
      const resolved = activeEu5Store()?.getState().appState.selectionState?.activeProfile;
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
