import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { openCampaignSave } from "@/features/campaign/openSave";
import { figuresOnlyText } from "@/features/campaign/saveText";
import { isFiguresOnly } from "@/features/campaign/types";
import { currentSaveInput } from "@/features/engine";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import type { Eu4Campaign } from "./useEu4Campaign";
import { selectSave, showCurrentPath, useCampaignView } from "./view";

/**
 * The right of every chart's date header: Figures only with its reason, Open
 * now, Other version, or Open save. The selection follows a step to another
 * save, as the open marker does. `changed` says when a save did not open.
 */
export function useOpenSlot(campaign: Eu4Campaign, selectedSave: AnalysisSave | undefined) {
  const { nav, playthroughId } = campaign;
  // The selection follows a step to another save, as the open marker does.
  const openKey = campaign.saves.find((x) => x.save.isOpen)?.save.key ?? null;
  useEffect(() => {
    if (!playthroughId || !openKey) return;
    const { lastOpen } = useCampaignView.getState();
    if (lastOpen?.campaignId === playthroughId && lastOpen.saveKey !== openKey)
      selectSave(playthroughId, openKey);
    useCampaignView.setState({ lastOpen: { campaignId: playthroughId, saveKey: openKey } });
  }, [playthroughId, openKey]);
  const [opening, setOpening] = useState(false);
  // The file name of a save that changed after analysis read it.
  const [changedName, setChanged] = useState<string | null>(null);
  // The open save and any step now, for a check that ends after a render.
  const now = useRef({ openKey, stepping: nav?.opening ?? null });
  useLayoutEffect(() => {
    now.current = { openKey, stepping: nav?.opening ?? null };
  });
  const openSelected = async () => {
    if (!nav || !selectedSave || !playthroughId) return;
    selectSave(playthroughId, selectedSave.save.key);
    setOpening(true);
    setChanged(null);
    try {
      // The dot is of the bytes that analysis read, so other bytes do not open as its save.
      const address = window.location.href;
      const input = currentSaveInput();
      const { openKey: before } = now.current;
      if (await campaign.fileChanged(selectedSave)) setChanged(selectedSave.save.name);
      // The player can leave the page or open or drop another save while the file is read.
      else if (
        !isFiguresOnly(selectedSave.save) &&
        window.location.href === address &&
        currentSaveInput() === input &&
        now.current.openKey === before &&
        now.current.stepping === null
      )
        await openCampaignSave(nav, selectedSave.save);
    } finally {
      setOpening(false);
    }
  };

  const changed = changedName && (
    <Alert variant="info">
      <Alert.Description className="px-3 py-2">
        {changedName} changed after it was read, so it did not open. It is read again.
      </Alert.Description>
    </Alert>
  );
  if (!selectedSave) return { openSlot: null, changed };
  const openSlot = isFiguresOnly(selectedSave.save) ? (
    <span className="flex flex-col items-end gap-0.5">
      <Badge className="h-[26px] justify-center rounded-md px-3 text-sm font-medium">
        Figures only
      </Badge>
      <span className="text-xs text-gray-600 dark:text-gray-300">
        {figuresOnlyText(selectedSave.save.source.reason)}
      </span>
      {selectedSave.save.source.reason === "otherBranch" && playthroughId && (
        <Button
          variant="ghost"
          className="h-6 px-1 py-0 text-xs underline"
          onClick={() => showCurrentPath(playthroughId)}
        >
          Show the current path
        </Button>
      )}
    </span>
  ) : campaign.open && selectedSave.save.key === campaign.open.save.key ? (
    <span role="status" className="text-sm text-gray-600 dark:text-gray-300">
      Open now
    </span>
  ) : selectedSave.save.isOpen ? (
    campaign.openOtherVersion && (
      <Badge
        title="The viewer shows another version of this file."
        className="h-[34px] justify-center rounded-md px-3 text-sm font-medium"
      >
        Other version
      </Badge>
    )
  ) : (
    <Button
      className="h-[34px] px-3 py-0 text-sm whitespace-nowrap"
      disabled={!nav || opening || nav.opening !== null}
      onClick={() => void openSelected()}
    >
      {opening ? "Opening" : "Open save"}
    </Button>
  );
  return { openSlot, changed };
}
