import { useMemo } from "react";
import { CampaignProvider } from "@/features/campaign/CampaignProvider";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import { toPlaythroughId } from "@/features/campaign/types";
import type { OpenSave } from "@/features/campaign/types";
import { parseDate } from "@/features/timeline/date";
import { captureEu4Carry } from "./campaignCarry";
import {
  useEu4Context,
  useEu4Meta,
  useEu4SaveInput,
  useSaveFilename,
  useServerSaveFile,
} from "./store";

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
    // Use the stable fingerprint for both local files and uploads. The
    // campaign_id in EU4's metadata can change within a playthrough.
    const playthroughId = toPlaythroughId(meta.playthroughId);
    if (date === null || playthroughId === null) return null;
    return {
      game: "eu4",
      playthroughId,
      // The rule of the server, which counts the player names.
      multiplayer: meta.multiplayer,
      date,
      name,
      source:
        input.kind === "server"
          ? { kind: "upload", saveId: input.saveId, uploaderId }
          : { kind: "local", ref: input },
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
      completion: "after-navigation",
      captureCarry: async () => ({ game: "eu4", payload: await captureEu4Carry(store) }),
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
