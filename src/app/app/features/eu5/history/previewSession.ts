import { create } from "zustand";
import type { CampaignNav } from "@/features/campaign/useCampaignNav";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { sameFileVersion } from "@/features/campaign/types";
import { isAbortError } from "@/lib/abortController";
import type { Eu5DateComponents, GradientConfig, MapMode, WorldSummary } from "@/wasm/wasm_eu5";
import type { LocationClickChangeEvent } from "../workers/map/map-module";
import type { AppTriggers, TimelapseRecording } from "../ui-engine";
import type { TimelapseOptions } from "@pdx.tools/timelapse";
import type { Eu5Store } from "../store/eu5Store";
import { activeEu5Store, subscribeEu5Session } from "../store/eu5Session";
import { captureEu5Carry } from "../campaignCarry";
import { descriptorDate } from "@/features/campaign/analysis/descriptor";
import { connectAnalysisFrames } from "./analysisClient";
import { LatestRequest } from "./latestRequest";
import { useHistory } from "./store";

/** The snapshot that the map shows. It changes only when the map accepts a frame. */
export type ShownSnapshot = {
  snapshotId: string;
  date: Eu5DateComponents;
  world: WorldSummary;
  gradient: GradientConfig | null;
};

/**
 * - `live`: the map shows the loaded save.
 * - `preview`: the overlay shows a snapshot. The loaded save stays open below it.
 * - `opening`: the save of the snapshot loads below the overlay.
 */
export type PreviewState =
  | { kind: "live" }
  | {
      kind: "preview" | "opening";
      /** A new preview gets a new ID, so a late failure of an earlier one has no effect. */
      id: number;
      campaignId: string;
      /** The snapshot at the playhead. */
      snapshotId: string;
      shown: ShownSnapshot | null;
      error: string | null;
    };

/** The preview of the session. A save change does not reset it. */
export const usePreviewSession = create<PreviewState>()(() => ({ kind: "live" }));

const get = usePreviewSession.getState;
const set = (state: PreviewState) => usePreviewSession.setState(state, true);

/** The map mode of the playback, or null when the playhead does not move. */
export const usePreviewPlayback = create<{ mode: MapMode | null }>()(() => ({ mode: null }));

export function setPreviewPlayback(mode: MapMode | null) {
  usePreviewPlayback.setState({ mode });
}

/** The snapshot that a recording shows. The date is null when no recording runs. */
export const usePreviewRecording = create<{
  date: Eu5DateComponents | null;
  gradient: GradientConfig | null;
}>()(() => ({ date: null, gradient: null }));

const isRecording = () => usePreviewRecording.getState().date !== null;
const endRecording = () => usePreviewRecording.setState({ date: null, gradient: null });

/** The engine calls that the preview uses. */
export type PreviewEngine = {
  trigger: Pick<
    AppTriggers,
    "connectMapFrames" | "presentOverlay" | "stopOverlay" | "clearOverlay" | "setInputGate"
  >;
};

let previewId = 0;

/** Each frame and each clear gets a larger token, across saves and engines. */
let lastToken = 0;
/** The token of the newest accepted frame or clear. A reply with a smaller token is old. */
let shownToken = 0;
/** The token of the newest frame request. Only its failure is shown. */
let paintToken = 0;

const ignore = () => {};
const changed = () => new DOMException("The playhead moved", "AbortError");

const connections = new WeakMap<PreviewEngine, Promise<() => void>>();

/** Connect the game worker of `engine` to the snapshot store. Return the disconnect. */
export function connectFrames(engine: PreviewEngine): () => void {
  const pending = connectAnalysisFrames(engine.trigger.connectMapFrames);
  connections.set(engine, pending);
  return () => {
    if (connections.get(engine) === pending) connections.delete(engine);
    void pending.then((disconnect) => disconnect(), ignore);
  };
}

function present(engine: PreviewEngine, snapshotId: string, mode: MapMode) {
  const before = get();
  if (before.kind === "live") return;
  const token = ++lastToken;
  paintToken = token;
  void (async () => {
    await connections.get(engine);
    const reply = await engine.trigger.presentOverlay(snapshotId, mode, token);
    if (!reply.accepted || token <= shownToken) return;
    shownToken = token;
    const state = get();
    if (state.kind === "live") return;
    const { world } = reply.observation;
    const date = descriptorDate(reply.observation);
    set({ ...state, shown: { snapshotId, date, world, gradient: reply.gradient } });
  })().catch((error) => {
    const state = get();
    if (isAbortError(error) || token !== paintToken) return;
    if (state.kind !== "live" && state.id === before.id) set({ ...state, error: String(error) });
  });
}

/** Move the playhead to a snapshot. The map shows it over the loaded save. */
export function previewSnapshot(
  engine: PreviewEngine,
  campaignId: string,
  snapshotId: string,
  mode: MapMode,
) {
  const state = get();
  if (state.kind === "live") {
    void engine.trigger.setInputGate(onPreviewClick).catch(ignore);
    set({ kind: "preview", id: ++previewId, campaignId, snapshotId, shown: null, error: null });
  } else if (state.snapshotId !== snapshotId || state.campaignId !== campaignId) {
    // An open in progress continues, but the overlay follows the playhead.
    set({ ...state, kind: "preview", campaignId, snapshotId, error: null });
  }
  present(engine, snapshotId, mode);
}

/** Paint the snapshot at the playhead again, for a new engine or map mode. */
export function repaintPreview(engine: PreviewEngine, mode: MapMode) {
  const state = get();
  if (state.kind === "live") return;
  // New workers do not have the gate.
  void engine.trigger.setInputGate(onPreviewClick).catch(ignore);
  present(engine, state.snapshotId, mode);
}

/** Show the loaded save again. */
function endPreview() {
  const token = ++lastToken;
  shownToken = token;
  set({ kind: "live" });
  const engine = activeEu5Store()?.getState().engine;
  if (!engine) return;
  void engine.trigger.stopOverlay().catch(ignore);
  void engine.trigger.clearOverlay(token).catch(ignore);
  void engine.trigger.setInputGate(null).catch(ignore);
}

/** End the preview and the playback, and do not open the saves that wait. */
export function cancelPreview() {
  // An explicit open stops a recording: the recording needs the loaded save.
  if (isRecording()) activeEu5Store()?.getState().engine.trigger.stopTimelapse();
  setPreviewPlayback(null);
  void opens.stop();
  if (get().kind !== "live") endPreview();
}

/** The snapshot of the loaded save, if the campaign analysis has it. */
export function loadedSnapshotId(store: Eu5Store): string | undefined {
  const { input, saveInput } = store.getState();
  if (input.kind === "server" || saveInput.kind !== "file") return undefined;
  const { entryId } = localSaveRegistry.sourceFor("eu5", input, saveInput.file);
  const source = entryId === null ? undefined : useHistory.getState().sources[entryId];
  return source && sameFileVersion(saveInput.file, source.version) ? source.snapshotId : undefined;
}

type OpenRequest = {
  campaignId: string;
  snapshotId: string;
  navigation: CampaignNav;
  click?: LocationClickChangeEvent;
};

async function openSnapshotSave(
  { campaignId, snapshotId, navigation, click }: OpenRequest,
  current: () => boolean,
) {
  const loaded = activeEu5Store();
  if (!loaded || loaded.getState().playthroughId !== campaignId) throw changed();
  const state = loaded.getState();
  if (loadedSnapshotId(loaded) !== snapshotId) {
    const sources = useHistory.getState().sources;
    const target = navigation.saves.find(
      (save) =>
        save.membership === "same" &&
        save.source.kind === "local" &&
        save.source.entryId !== null &&
        sources[save.source.entryId]?.snapshotId === snapshotId,
    );
    if (!target || target.source.kind !== "local" || target.source.entryId === null)
      throw Error("Reselect the original save to inspect this date.");
    const entry = localSaveRegistry.get(target.source.entryId);
    const source = sources[target.source.entryId];
    if (!entry || !source) throw Error("This save is no longer available.");
    const file = entry.ref.kind === "handle" ? await entry.ref.file.getFile() : entry.ref.file;
    if (!sameFileVersion(file, source.version))
      throw Error("This save changed. Reselect it so analysis can update this date.");
    if (!current()) throw changed();
    const carry = await captureEu5Carry(loaded);
    if (!current()) throw changed();
    const result = await navigation.open(
      { ...target, isOpen: false },
      {
        game: "eu5",
        payload: {
          ...carry,
          insightPanel: {
            open: click ? true : state.insightPanelOpen,
            width: state.insightPanelWidth,
          },
          inspection: click ? { click } : undefined,
        },
      },
    );
    if (result.kind === "cancelled") throw changed();
    if (result.kind !== "navigated")
      throw Error("Could not open this save. Try selecting it in the campaign list.");
  } else if (click) {
    // The save of the snapshot is open, so the click applies to it now.
    const carry = await captureEu5Carry(loaded);
    await state.engine.trigger.restoreCampaignView({ ...carry, inspection: { click } });
  }
  // A save that loads in place keeps the panel state of the previous save,
  // so the carry alone does not open the panel.
  if (click) activeEu5Store()?.getState().setInsightPanelOpen(true);

  // Show the loaded save only when the playhead is still on it and no other save waits.
  const after = get();
  if (current() && after.kind === "opening" && after.snapshotId === snapshotId) endPreview();
}

/** One open at a time. A new target replaces the target that waits. */
const opens = new LatestRequest<OpenRequest, void>(openSnapshotSave);

/** Open the save of the snapshot at the playhead. The overlay stays until that save is ready. */
export function openPreview(navigation: CampaignNav, click?: LocationClickChangeEvent) {
  const state = get();
  // A recording uses the loaded save until it is done.
  if (state.kind === "live" || isRecording()) return Promise.resolve();
  const { id, campaignId, snapshotId } = state;
  set({ ...state, kind: "opening", error: null });
  return opens.request({ campaignId, snapshotId, navigation, click }).catch((error) => {
    const now = get();
    if (now.kind === "live" || now.id !== id || now.snapshotId !== snapshotId) return;
    if (isAbortError(error)) {
      if (now.kind === "opening") set({ ...now, kind: "preview" });
    } else set({ ...now, kind: "preview", error: String(error) });
  });
}

let navigation: CampaignNav | null = null;

/** The campaign navigation that a click on the map uses to open a save. */
export function bindPreviewNavigation(next: CampaignNav | null) {
  navigation = next;
}

/** A click on the map during a preview opens the save of the snapshot at once. */
function onPreviewClick(event: LocationClickChangeEvent) {
  // A recording uses the loaded save until it is done.
  if (!navigation || get().kind === "live" || isRecording()) return;
  // The playhead stops on the clicked snapshot.
  setPreviewPlayback(null);
  void openPreview(navigation, event);
}

/** The engine calls that a recording of saved dates uses. */
export type RecordingEngine = PreviewEngine & {
  trigger: Pick<AppTriggers, "recordSavedDates">;
};

/**
 * Record the saved dates of a campaign to a video file. Playback stops, and
 * the map shows each snapshot in turn, as playback shows it. After the
 * recording, the map shows again what it showed before.
 */
export async function recordSavedDates(
  engine: RecordingEngine,
  snapshots: { id: string; date: Eu5DateComponents }[],
  mode: MapMode,
  options: TimelapseOptions,
): Promise<TimelapseRecording | null> {
  setPreviewPlayback(null);
  // An open that has started can replace the save. The recording does not
  // start until it is done.
  await opens.stop();
  if (activeEu5Store()?.getState().engine !== engine) {
    throw Error("The save changed. Export the video again.");
  }
  await connections.get(engine);
  usePreviewRecording.setState({ date: snapshots[0]?.date ?? null });
  // Clicks during a preview already have the gate. Without a preview, the
  // gate keeps clicks off the loaded save, which the map does not show.
  const gated = get().kind === "live";
  if (gated) void engine.trigger.setInputGate(ignore).catch(ignore);
  try {
    return await engine.trigger.recordSavedDates(options, {
      snapshots,
      present: async (snapshotId) => {
        const reply = await engine.trigger.presentOverlay(snapshotId, mode, ++lastToken);
        if (reply.accepted) {
          const date = descriptorDate(reply.observation);
          usePreviewRecording.setState({ date, gradient: reply.gradient });
        }
        return reply.accepted;
      },
    });
  } finally {
    endRecording();
    // The save can change in place during the recording. The overlay and the
    // gate belong to the workers, which the new engine keeps, so clean up
    // through the engine that is active now.
    const active = activeEu5Store()?.getState().engine;
    if (active) {
      const state = get();
      if (state.kind === "live") {
        const token = ++lastToken;
        shownToken = token;
        void active.trigger.clearOverlay(token).catch(ignore);
        if (gated) void active.trigger.setInputGate(null).catch(ignore);
      } else {
        present(active, state.snapshotId, mode);
      }
    }
  }
}

// The workers of another session have no overlay and no gate.
subscribeEu5Session(() => {
  setPreviewPlayback(null);
  // A recording in the old workers can stop without an answer.
  endRecording();
  if (get().kind !== "live") set({ kind: "live" });
});
