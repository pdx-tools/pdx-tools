import { useMemo } from "react";
import { CampaignProvider } from "@/features/campaign/CampaignProvider";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import { toCampaignId } from "@/features/campaign/types";
import type { CampaignStepTarget, LocalSaveRef, OpenSave } from "@/features/campaign/types";
import { captureEu5Carry } from "./campaignCarry";
import {
  stepEu5Session,
  useEu5Context,
  useEu5Engine,
  useEu5Input,
  useEu5PlaythroughId,
  useEu5Players,
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

  const { ref } = target;
  return ref.kind === "handle"
    ? { kind: "handle", file: ref.handle, name: ref.name }
    : { kind: "file", file: ref.file };
}

function localRef(save: Eu5SaveInput): LocalSaveRef | null {
  switch (save.kind) {
    case "handle":
      return { kind: "handle", handle: save.file, name: save.name };
    case "file":
      return { kind: "file", file: save.file };
    case "server":
      return null;
  }
}

/** The open EU5 save as the campaign sees it. */
function useEu5OpenSave(input: Eu5SaveInput): OpenSave | null {
  const playthroughId = useEu5PlaythroughId();
  const players = useEu5Players();
  const date = useEu5SaveDate();
  const name = useSaveFilename();

  return useMemo((): OpenSave | null => {
    const campaignId = toCampaignId(playthroughId);
    if (campaignId === null) return null;
    return {
      game: "eu5",
      campaignId,
      playthroughId,
      multiplayer: players.length > 1,
      date,
      name,
      source:
        input.kind === "server"
          ? { kind: "upload", saveId: input.saveId, uploaderId: input.uploaderId }
          : { kind: "local", ref: localRef(input) },
    };
  }, [playthroughId, players.length, date, name, input]);
}

/**
 * The campaign of the open EU5 save, for the timeline and the control
 * panel. The store has the save as the page got it: a file handle stays a
 * handle, so that the campaign can tell which of its files is open.
 */
export function Eu5CampaignProvider({ children }: { children: React.ReactNode }) {
  const store = useEu5Context();
  const engine = useEu5Engine();
  const input = useEu5Input();
  const open = useEu5OpenSave(input);
  const adapter = useMemo(
    (): CampaignAdapter => ({
      readHeader: (file) => engine.trigger.readSaveHeader(file),
      captureCarry: () => captureEu5Carry(store),
      // The next save loads into the map on screen.
      handOff: (target) => stepEu5Session(stepInput(target)),
    }),
    [engine, store],
  );

  return (
    <CampaignProvider open={open} adapter={adapter}>
      {children}
    </CampaignProvider>
  );
}
