import { useMemo } from "react";
import { CampaignProvider } from "@/features/campaign/CampaignProvider";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import { toPlaythroughId } from "@/features/campaign/types";
import type { CampaignStepTarget, OpenSave } from "@/features/campaign/types";
import { captureEu5Carry } from "./campaignCarry";
import {
  stepEu5Session,
  useEu5Context,
  useEu5Input,
  useEu5Multiplayer,
  useEu5PlaythroughId,
  useEu5SaveDate,
  useSaveFilename,
} from "./store";
import type { Eu5SaveInput } from "./store/types";

/** The input of a save of the campaign, as the page that opens it builds it. */
function stepInput(target: CampaignStepTarget): Eu5SaveInput {
  if (target.kind === "upload") {
    return {
      kind: "server",
      saveId: target.saveId,
      name: target.name,
      uploaderId: target.uploaderId,
    };
  }

  return target.ref;
}

/**
 * True when the target opens on the route of the open save. An upload
 * opens on its permalink, and a local file opens on the home page.
 */
function onSameRoute(input: Eu5SaveInput, target: CampaignStepTarget): boolean {
  return (input.kind === "server") === (target.kind === "upload");
}

/** The open EU5 save as the campaign sees it. */
function useEu5OpenSave(input: Eu5SaveInput): OpenSave | null {
  const rawPlaythroughId = useEu5PlaythroughId();
  const multiplayer = useEu5Multiplayer();
  const date = useEu5SaveDate();
  const name = useSaveFilename();

  return useMemo((): OpenSave | null => {
    const playthroughId = toPlaythroughId(rawPlaythroughId);
    if (playthroughId === null) return null;
    return {
      game: "eu5",
      playthroughId,
      campaignIdHint: null,
      multiplayer,
      date,
      name,
      source:
        input.kind === "server"
          ? { kind: "upload", saveId: input.saveId, uploaderId: input.uploaderId }
          : { kind: "local", ref: input },
    };
  }, [rawPlaythroughId, multiplayer, date, name, input]);
}

/**
 * The campaign of the open EU5 save, for the timeline and the control
 * panel. The store has the save as the page got it, so a file handle stays
 * a handle. Thus the campaign can tell which of its files is open.
 */
export function Eu5CampaignProvider({ children }: { children: React.ReactNode }) {
  const store = useEu5Context();
  const input = useEu5Input();
  const open = useEu5OpenSave(input);
  const adapter = useMemo(
    (): CampaignAdapter => ({
      completion: "before-navigation",
      captureCarry: async () => ({ game: "eu5", payload: await captureEu5Carry(store) }),
      // On the same route, the next save loads into the map on screen. On a
      // different route, the page loads it with a new map, and the carry
      // keeps the view.
      prepare: async (target) => {
        if (onSameRoute(input, target)) await stepEu5Session(stepInput(target));
      },
    }),
    [store, input],
  );

  return (
    <CampaignProvider open={open} adapter={adapter}>
      {children}
    </CampaignProvider>
  );
}
