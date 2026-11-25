import { localSaveRegistry } from "@/features/campaign/localSaves";
import { useMemo } from "react";
import { CampaignProvider } from "@/features/campaign/CampaignProvider";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import type { CampaignStepTarget, OpenSave } from "@/features/campaign/types";
import { captureEu5Carry } from "./campaignCarry";
import { cancelPreview, usePreviewSession } from "./history/previewSession";
import { replaceInput } from "@/features/engine/engineStore";
import {
  rebindEu5Session,
  stepEu5Session,
  useEu5Context,
  useEu5Input,
  useEu5ParsedHash,
  useEu5SaveInput,
  useEu5Multiplayer,
  useEu5PlaythroughId,
  useEu5SaveDate,
  useSaveFilename,
} from "./store";
import { sameEu5Save } from "./store/types";
import type { Eu5SaveInput } from "./store/types";

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

/** Saves on the same route can reuse the current map. */
function onSameRoute(input: Eu5SaveInput, target: CampaignStepTarget): boolean {
  return (input.kind === "server") === (target.kind === "upload");
}

function useEu5OpenSave(input: Eu5SaveInput): OpenSave | null {
  const playthroughId = useEu5PlaythroughId();
  const multiplayer = useEu5Multiplayer();
  const date = useEu5SaveDate();
  const name = useSaveFilename();
  const parsed = useEu5SaveInput();
  const hash = useEu5ParsedHash();

  return useMemo((): OpenSave | null => {
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
          : localSaveRegistry.sourceFor(
              "eu5",
              input,
              parsed.kind === "file" ? parsed.file : null,
              hash,
            ),
    };
  }, [playthroughId, multiplayer, date, name, input, parsed, hash]);
}

export function Eu5CampaignProvider({ children }: { children: React.ReactNode }) {
  const store = useEu5Context();
  const input = useEu5Input();
  const open = useEu5OpenSave(input);
  const adapter = useMemo(
    (): CampaignAdapter => ({
      completion: "before-navigation",
      captureCarry: async () => {
        // An explicit open ends the preview. The preview did not change the
        // loaded save, so its selection is the one to carry.
        cancelPreview();
        return { game: "eu5", payload: await captureEu5Carry(store) };
      },
      // Reuse the map when the target stays on the current route.
      prepare: async (target, options) => {
        if (!onSameRoute(input, target)) return;
        const entry = input.kind === "server" ? undefined : localSaveRegistry.entryOf("eu5", input);
        const isStable = entry?.kept != null;
        await stepEu5Session(stepInput(target), { ...options, isStable });
      },
      pin: async () => {
        const { engine, setParsedHash } = store.getState();
        setParsedHash(await engine.queries.pin());
      },
      adopt: async ({ from, ref, file, hash, commit }) => {
        const { input, engine } = store.getState();
        if (!sameEu5Save(input, from) || !(await engine.queries.rebind(file, hash))) return false;
        if (!rebindEu5Session(from, ref, { kind: "file", file })) return false;
        commit();
        replaceInput({ kind: "eu5", data: ref });
        return true;
      },
      isWorking: () => {
        const { timelapse, timelinePlayback } = store.getState().appState;
        return (
          timelapse.status !== "idle" ||
          timelinePlayback === "playing" ||
          timelinePlayback === "rewinding" ||
          usePreviewSession.getState().kind !== "live"
        );
      },
      country: async () => {
        const { engine, players } = store.getState();
        const player = players.length === 1 ? players[0] : null;
        const identity = player && (await engine.queries.getCountryIdentity(player.countryIdx));
        if (!identity) return { flag: null, name: null };
        const found = await engine.queries.searchEntities(identity.tag);
        const country = found.find((x) => x.kind === "country" && x.id === player.countryIdx);
        return { flag: identity.tag, name: country?.name ?? null };
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
