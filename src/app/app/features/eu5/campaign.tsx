import { localSaveRegistry } from "@/features/campaign/localSaves";
import { useMemo } from "react";
import { CampaignProvider } from "@/features/campaign/CampaignProvider";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import type { CampaignStepTarget, OpenSave } from "@/features/campaign/types";
import { captureEu5Carry } from "./campaignCarry";
import { useHistory } from "./history/store";
import { cancelObservationLoad } from "./history/observationLoader";
import {
  stepEu5Session,
  useEu5Context,
  useEu5Input,
  useEu5SaveInput,
  useEu5Multiplayer,
  useEu5PlaythroughId,
  useEu5SaveDate,
  useSaveFilename,
} from "./store";
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
          : localSaveRegistry.sourceFor("eu5", input, parsed.kind === "file" ? parsed.file : null),
    };
  }, [playthroughId, multiplayer, date, name, input, parsed]);
}

export function Eu5CampaignProvider({ children }: { children: React.ReactNode }) {
  const store = useEu5Context();
  const input = useEu5Input();
  const open = useEu5OpenSave(input);
  const adapter = useMemo(
    (): CampaignAdapter => ({
      completion: "before-navigation",
      captureCarry: async () => {
        // Explicit navigation captures its own carry. Settling supplies a carry
        // to nav.open directly, so it must not cancel its own loading operation.
        const { playthroughId, engine, appState } = store.getState();
        const history = useHistory.getState();
        if (
          playthroughId &&
          (appState.mapProjection ||
            history.selectedObservations[playthroughId] ||
            history.settlingObservation?.campaignId === playthroughId)
        ) {
          useHistory.setState((state) => ({
            selectedObservations: Object.fromEntries(
              Object.entries(state.selectedObservations).filter(([id]) => id !== playthroughId),
            ),
          }));
          await cancelObservationLoad(playthroughId);
          await engine.trigger.stopMapProjection();
          // Restore the retained save's selection before capturing its stable IDs.
          await engine.trigger.clearMapProjection();
          useHistory.setState((state) => ({
            previewCarries: { ...state.previewCarries, [playthroughId]: undefined },
          }));
        }
        return { game: "eu5", payload: await captureEu5Carry(store) };
      },
      // Reuse the map when the target stays on the current route.
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
