import { useMemo } from "react";
import { CampaignProvider } from "@/features/campaign/CampaignProvider";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import { toCampaignId } from "@/features/campaign/types";
import type { LocalSaveRef, OpenSave } from "@/features/campaign/types";
import { parseDate } from "@/features/timeline/date";
import { captureEu4Carry } from "./campaignCarry";
import {
  useEu4Context,
  useEu4Meta,
  useEu4SaveInput,
  useSaveFilename,
  useServerSaveFile,
} from "./store";
import type { Eu4SaveInput } from "./store";
import { getEu4Worker } from "./worker/getEu4Worker";

function localRef(save: Eu4SaveInput): LocalSaveRef | null {
  switch (save.kind) {
    case "handle":
      return { kind: "handle", handle: save.file, name: save.name };
    case "file":
      return { kind: "file", file: save.file };
    case "server":
      return null;
  }
}

/** The open EU4 save as the campaign sees it. */
function useEu4OpenSave(): OpenSave | null {
  // The input of the store, not of the page: while the next save loads, the
  // store still holds the one on screen.
  const input = useEu4SaveInput();
  const meta = useEu4Meta();
  const name = useSaveFilename();
  const upload = useServerSaveFile();
  const uploaderId = upload?.user_id ?? null;

  return useMemo((): OpenSave | null => {
    const date = parseDate(meta.date);
    // Local files are grouped by the header's campaign id; uploads by the
    // playthrough id, which only the parsed gamestate gives.
    const campaignId = toCampaignId(meta.campaign_id);
    if (date === null || (campaignId === null && meta.playthoughId === "")) return null;
    return {
      game: "eu4",
      campaignId,
      playthroughId: meta.playthoughId,
      multiplayer: Object.keys(meta.players).length > 1,
      date,
      name,
      source:
        input.kind === "server"
          ? { kind: "upload", saveId: input.saveId, uploaderId }
          : { kind: "local", ref: localRef(input) },
    };
  }, [meta, name, input, uploaderId]);
}

/** The campaign of the open EU4 save, for the timeline. */
export function Eu4CampaignProvider({
  loadError,
  children,
}: {
  /** A save that fails to load keeps the store of the open save, and this error. */
  loadError: unknown;
  children: React.ReactNode;
}) {
  const store = useEu4Context();
  const open = useEu4OpenSave();
  const adapter = useMemo(
    (): CampaignAdapter => ({
      readHeader: (file) => getEu4Worker().readSaveMeta(file),
      captureCarry: () => captureEu4Carry(store),
      // A watched file would bring back the save that the player left.
      leave: async () => {
        if (store.getState().watcher.status !== "idle") {
          await store.getState().actions.stopWatcher();
        }
      },
    }),
    [store],
  );

  return (
    <CampaignProvider open={open} adapter={adapter} loadError={loadError}>
      {children}
    </CampaignProvider>
  );
}
