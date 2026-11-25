import { localSaveRegistry } from "@/features/campaign/localSaves";
import { useMemo } from "react";
import { CampaignProvider } from "@/features/campaign/CampaignProvider";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import type { OpenSave } from "@/features/campaign/types";
import type { LocalSaveRef } from "@/features/campaign/types";
import { fileVersion } from "@/features/campaign/types";
import { replaceInput } from "@/features/engine/engineStore";
import { emitEvent } from "@/lib/events";
import { parseDate } from "@/features/timeline/date";
import { captureEu4Carry } from "./campaignCarry";
import { getEu4Worker } from "./worker/getEu4Worker";
import type { LiveUpdate, OpenSource } from "./worker/module";
import {
  eu4Input,
  useEu4Context,
  useEu4Meta,
  useEu4SaveInput,
  useEu4ParsedSource,
  useSaveFilename,
  useServerSaveFile,
} from "./store";
import type { Eu4Store } from "./store";

function useEu4OpenSave(): OpenSave | null {
  // Use the save on screen while its replacement loads.
  const input = useEu4SaveInput();
  const source = useEu4ParsedSource();
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
          : localSaveRegistry.sourceFor("eu4", input, source.fileVersion, source.hash),
    };
  }, [meta, name, input, uploaderId, source]);
}

/** One change at a time, as each compares with the result of the one before. */
let replacing: Promise<unknown> = Promise.resolve();

/** Get the result of a worker call, and the change of the store that it needs. */
type Replacement = (
  open: OpenSource,
  input: LocalSaveRef,
) => Promise<(() => void | Promise<void>) | null>;

/**
 * Change what the open save reads. A save that loads now, or that opened
 * during the worker call, ends it.
 */
async function replaceNow(store: Eu4Store, next: LocalSaveRef, replacement: Replacement) {
  const { input, source } = store.getState().save;
  if (!eu4Input.holds(input) || input.kind === "server" || source.hash === null) return false;
  const apply = await replacement(source, input);
  if (apply === null || !eu4Input.holds(input)) return false;
  // Set this before the page input changes, so that the change is not a load.
  eu4Input.replace(next);
  await apply();
  if (eu4Input.holds(next)) replaceInput({ kind: "eu4", data: next });
  return true;
}

function replaceOpenSave(...args: Parameters<typeof replaceNow>): Promise<boolean> {
  const result = replacing.then(() => replaceNow(...args));
  replacing = result.catch(() => {});
  return result;
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
      adopt: ({ from, ref, file, hash, commit }) =>
        replaceOpenSave(store, ref, async (open, input) => {
          if (input.file !== from.file || open.hash !== hash) return null;
          if (!(await getEu4Worker().rebind(open, ref))) return null;
          return () => {
            commit();
            store.getState().actions.replaceInput(ref, fileVersion(file));
          };
        }),
      update: async (entry, isWanted) => {
        const { ref, hash } = entry;
        if (hash === null) return "stale";
        let result: LiveUpdate["kind"] = "stale";
        await replaceOpenSave(store, ref, async (open) => {
          if (!isWanted()) return null;
          const worker = getEu4Worker();
          const update = await worker.reparse(open, ref, hash);
          result = update.kind;
          if (update.kind !== "updated") return null;
          const { meta, achievements, kind: _, ...source } = update;
          const countries = await worker.eu4GetCountries();
          emitEvent({ kind: "Save parsed", game: "eu4", source: "watched" });
          return () =>
            store
              .getState()
              .actions.updateSave({ meta, achievements, countries, input: ref, source });
        });
        return result;
      },
      isWorking: () => {
        const { playback, locked } = store.getState();
        return locked || playback === "playing" || playback === "rewinding";
      },
      country: async () => {
        const { meta } = store.getState().save;
        return { flag: meta.player, name: meta.player_tag_name };
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
