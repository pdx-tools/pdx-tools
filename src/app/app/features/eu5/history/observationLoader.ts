import type { CampaignNav } from "@/features/campaign/useCampaignNav";
import { holdsRef, localSaveRegistry } from "@/features/campaign/localSaves";
import { sameFileVersion } from "@/features/campaign/types";
import { isAbortError } from "@/lib/abortController";
import { activeEu5Store } from "../store";
import { captureEu5Carry } from "../campaignCarry";
import type { MapInteraction } from "./mapInteraction";
import { LatestRequest } from "./latestRequest";
import { useHistory } from "./store";

type LoadRequest = { hash: string; navigation: CampaignNav; interaction?: MapInteraction };
const loaders = new Map<string, LatestRequest<LoadRequest, void>>();
const changed = () => new DOMException("Selected observation changed", "AbortError");
/** One loader serves automatic settling and explicit inspection across engine replacements. */
async function loadObservation(campaignId: string, request: LoadRequest, current: () => boolean) {
  const { hash, navigation, interaction } = request;
  const check = () => {
    if (!current() || useHistory.getState().selectedObservations[campaignId] !== hash)
      throw changed();
  };
  check();
  const sources = useHistory.getState().sources;
  const target = navigation.saves.find(
    (save) =>
      save.membership === "same" &&
      save.source.kind === "local" &&
      save.source.entryId !== null &&
      sources[save.source.entryId]?.hash === hash,
  );
  if (!target || target.source.kind !== "local" || target.source.entryId === null)
    throw Error("Reselect the original save to inspect this date.");
  const entry = localSaveRegistry.get(target.source.entryId),
    source = sources[target.source.entryId];
  if (!entry || !source) throw Error("This save is no longer available.");
  const file = entry.ref.kind === "handle" ? await entry.ref.file.getFile() : entry.ref.file;
  check();
  if (!sameFileVersion(file, source.version))
    throw Error("This save changed. Reselect it so analysis can update this date.");
  const loaded = activeEu5Store();
  if (!loaded || loaded.getState().playthroughId !== campaignId) throw changed();
  const state = loaded.getState();
  const alreadyOpen =
    state.input.kind !== "server" &&
    holdsRef(entry, state.input) &&
    state.saveInput.kind === "file" &&
    sameFileVersion(state.saveInput.file, source.version);
  useHistory.setState({ settlingObservation: { campaignId, hash } });
  try {
    await state.engine.trigger.stopMapProjection().catch((error) => {
      if (!isAbortError(error)) throw error;
    });
    check();
    if (!alreadyOpen) {
      const original =
        useHistory.getState().previewCarries[campaignId] ?? (await captureEu5Carry(loaded));
      check();
      const result = await navigation.open(
        { ...target, isOpen: false },
        {
          game: "eu5",
          payload: {
            ...original,
            mapMode: state.appState.currentMapMode,
            viewport: state.appState.mapViewport?.viewport ?? original.viewport,
            insightPanel: {
              open: interaction ? true : state.insightPanelOpen,
              width: state.insightPanelWidth,
            },
            inspection: interaction ? { interaction } : undefined,
          },
        },
      );
      if (result.kind !== "navigated") {
        check();
        throw Error("Could not open this save. Try selecting it in the campaign list.");
      }
    }
    check();
    const active = activeEu5Store();
    if (!active || active.getState().playthroughId !== campaignId) throw changed();
    if (alreadyOpen) {
      await active.getState().engine.trigger.clearMapProjection();
      if (interaction) await active.getState().engine.trigger.replayMapInteraction(interaction);
    }
    if (interaction) active.getState().setInsightPanelOpen(true);
    useHistory.setState((state) => ({
      previewCarries: { ...state.previewCarries, [campaignId]: undefined },
    }));
  } finally {
    if (useHistory.getState().settlingObservation?.hash === hash)
      useHistory.setState({ settlingObservation: null });
  }
}
export function ensureObservationLoaded(
  campaignId: string,
  hash: string,
  navigation: CampaignNav,
  interaction?: MapInteraction,
) {
  let loader = loaders.get(campaignId);
  if (!loader) {
    loader = new LatestRequest((request, current) => loadObservation(campaignId, request, current));
    loaders.set(campaignId, loader);
  }
  return loader.request({ hash, navigation, interaction });
}
export function cancelObservationLoad(campaignId: string) {
  void loaders.get(campaignId)?.stop();
}
