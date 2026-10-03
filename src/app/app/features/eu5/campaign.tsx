import { useMemo } from "react";
import { CampaignProvider } from "@/features/campaign/CampaignProvider";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import type { LocalSaveRef, OpenSave } from "@/features/campaign/types";
import { pdxApi } from "@/services/appApi";
import { captureEu5Carry } from "./campaignCarry";
import {
  useEu5Context,
  useEu5Engine,
  useEu5PlaythroughId,
  useEu5Players,
  useEu5SaveDate,
  useSaveFilename,
} from "./store";
import type { Eu5SaveInput } from "./store/types";

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
  const saveId = input.kind === "server" ? input.saveId : "";
  const upload = pdxApi.eu5Saves.useGet(saveId, { enabled: saveId !== "" });
  const uploaderId = upload.data?.user_id ?? null;

  return useMemo((): OpenSave | null => {
    if (playthroughId === "") return null;
    return {
      game: "eu5",
      campaignId: playthroughId,
      playthroughId,
      multiplayer: players.length > 1,
      date,
      name,
      source:
        input.kind === "server"
          ? { kind: "upload", saveId: input.saveId, uploaderId }
          : { kind: "local", ref: localRef(input) },
    };
  }, [playthroughId, players.length, date, name, input, uploaderId]);
}

/**
 * The campaign of the open EU5 save, for the timeline and the control
 * panel. `input` is the save as the page got it: a file handle stays a
 * handle, so that the campaign can tell which of its files is open.
 */
export function Eu5CampaignProvider({
  input,
  children,
}: {
  input: Eu5SaveInput;
  children: React.ReactNode;
}) {
  const store = useEu5Context();
  const engine = useEu5Engine();
  const open = useEu5OpenSave(input);
  const adapter = useMemo(
    (): CampaignAdapter => ({
      readHeader: (file) => engine.trigger.readSaveHeader(file),
      captureCarry: () => captureEu5Carry(store),
    }),
    [engine, store],
  );

  return (
    <CampaignProvider open={open} adapter={adapter}>
      {children}
    </CampaignProvider>
  );
}
