import { localSaveRegistry } from "@/features/campaign/localSaves";
import { useMemo } from "react";
import { CampaignProvider } from "@/features/campaign/CampaignProvider";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import type { OpenSave } from "@/features/campaign/types";
import { parseDate } from "@/features/timeline/date";
import { captureEu4Carry } from "./campaignCarry";
import {
  useEu4Context,
  useEu4Meta,
  useEu4SaveInput,
  useEu4FileVersion,
  useSaveFilename,
  useServerSaveFile,
} from "./store";

function useEu4OpenSave(): OpenSave | null {
  // Use the save on screen while its replacement loads.
  const input = useEu4SaveInput();
  const fileVersion = useEu4FileVersion();
  const meta = useEu4Meta();
  const name = useSaveFilename();
  const upload = useServerSaveFile();
  const uploaderId = upload?.user_id ?? null;

  return useMemo((): OpenSave | null => {
    const date = parseDate(meta.date);
    // EU4 metadata campaign IDs can change within one playthrough.
    const { playthroughId } = meta;
    if (date === null || playthroughId === null) return null;
    return {
      game: "eu4",
      playthroughId,
      campaignIdHint: meta.campaign_id || null,

      multiplayer: meta.multiplayer,
      date,
      name,
      source:
        input.kind === "server"
          ? { kind: "upload", saveId: input.saveId, uploaderId }
          : localSaveRegistry.sourceFor("eu4", input, fileVersion),
    };
  }, [meta, name, input, uploaderId, fileVersion]);
}

export function Eu4CampaignProvider({
  loadError,
  children,
}: {
  /** A failed load keeps the current save visible. */
  loadError: unknown;
  children: React.ReactNode;
}) {
  const store = useEu4Context();
  const open = useEu4OpenSave();
  const adapter = useMemo(
    (): CampaignAdapter => ({
      completion: "after-navigation",
      captureCarry: async () => ({ game: "eu4", payload: await captureEu4Carry(store) }),
      // Prevent the file watcher from restoring the previous save.
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
