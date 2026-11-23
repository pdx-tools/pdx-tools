import { useEffect, useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import { useCampaignNavigation } from "@/features/campaign/CampaignProvider";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { fileVersion, sameFileVersion } from "@/features/campaign/types";
import type { FileVersion, OpenSave, PlaythroughId } from "@/features/campaign/types";
import { useIsCampaignAnalysisEnabled } from "@/features/campaign/analysis/useIsCampaignAnalysisEnabled";
import { descriptorDate } from "@/features/campaign/analysis/descriptor";
import { isAnalysisPaused } from "@/features/campaign/analysis/analysisState";
import { formatLongDate } from "@/features/timeline/date";
import { captureException } from "@/lib/captureException";
import { emitEvent } from "@/lib/events";
import { toast } from "@/lib/toast";
import { importEu4Write } from "./analysis/analyzeCampaign";
import { useEu4History } from "./analysis/store";
import { useEu4Context } from "./store";
import type { Eu4Store } from "./store";
import { getEu4Worker } from "./worker/getEu4Worker";
import type { Eu4Snapshot } from "./analysis/analysisTypes";
import { adoptWatchStart } from "@/features/campaign/analysis/watchedWrite";
import type { WriteClass } from "@/features/campaign/analysis/watchedWrite";
import { pointKey } from "./analysis/campaignSaves";
import { selectSave } from "./features/campaign/view";

/** The file that the game writes, while the player watches it. */
export type WatchedFile = Readonly<{
  /** The watch run. Its writes share it as their campaign point session. */
  session: string;
  entryId: string;
  name: string;
  playthroughId: PlaythroughId;
  /** The file as the player opened it when the watch began. */
  startVersion: FileVersion | null;
  /** The game has written the file since the watch began. */
  firstWriteRead: boolean;
  /** When the game last wrote the file, in ms since the epoch. */
  lastWrite: number;
  /** The file could not be found or opened. Each poll tries again. */
  unreadable: boolean;
  /** The last write did not parse, such as while the game writes it. */
  writing: boolean;
  /** Why the figures of the last write were not kept. */
  figuresError: string | null;
}>;

/** The watched file of this tab. It outlives campaign navigation. */
export const useEu4Watch = create<{ watching: WatchedFile | null }>()(() => ({ watching: null }));

/** The snapshot of the last write that the viewer parsed, until the analysis keeps it. */
let parsedWrite: { version: FileVersion; snapshot: Eu4Snapshot } | null = null;
/** The file versions that failed, so a poll does not read them again. */
const failed = { view: null as FileVersion | null, figures: null as FileVersion | null };

/** Watch the file of the open save, if it is a local file that the browser can read again. */
export function startWatching(open: OpenSave, keepFigures: boolean) {
  if (open.source.kind !== "local" || open.source.ref.kind !== "handle") return;
  const { entryId, ref, fileVersion } = open.source;
  const { playthroughId } = open;
  if (entryId === null || playthroughId === null) return;
  failed.view = null;
  parsedWrite = null;
  failed.figures = null;
  emitEvent({ kind: "Save watching" });
  useEu4Watch.setState({
    watching: {
      session: crypto.randomUUID(),
      entryId,
      name: ref.name,
      playthroughId,
      startVersion: fileVersion,
      firstWriteRead: false,
      lastWrite: fileVersion?.lastModified ?? 0,
      unreadable: false,
      writing: false,
      figuresError: null,
    },
  });
  // Watching charts each write, so the campaign's other files are read too.
  // A paused campaign stays paused, such as after the player stopped an import.
  const history = useEu4History.getState();
  if (keepFigures && !history.analysisEnabledCampaigns.includes(playthroughId))
    history.enableAnalysis(playthroughId);
}

export function stopWatching() {
  parsedWrite = null;
  useEu4Watch.setState({ watching: null });
}

/** True when the open save is the watched file. */
export function isWatchedOpen(watching: WatchedFile | null, open: OpenSave | null) {
  return !!watching && open?.source.kind === "local" && open.source.entryId === watching.entryId;
}

const otherCampaignText = (name: string) => `${name} now holds another campaign. Watching stopped.`;

const POLL_MS = 5000;
/** The mounted EU4 views. */
let mounted = 0;

/**
 * Leaving the EU4 view ends the watch. A campaign step to another route
 * mounts the next view at once, while its save still loads.
 */
export function useWatchLifetime() {
  useEffect(() => {
    mounted++;
    return () => {
      mounted--;
      setTimeout(() => {
        if (mounted === 0) stopWatching();
      });
    };
  }, []);
}
let reading: Promise<void> | null = null;

/**
 * Read each new write of the watched file. The open save follows it in
 * place, and its figures join the campaign analysis.
 */
export function Eu4CampaignWatch({ open }: { open: OpenSave | null }) {
  const store = useEu4Context();
  const nav = useCampaignNavigation();
  const keepFigures = useIsCampaignAnalysisEnabled();
  const watching = useEu4Watch((state) => state.watching);
  const latest = useRef({ store, open, opening: nav?.opening ?? null, keepFigures });
  useLayoutEffect(() => {
    latest.current = { store, open, opening: nav?.opening ?? null, keepFigures };
  });

  // Opening a save of another campaign ends the watch.
  const otherCampaign =
    !!watching && !!open?.playthroughId && open.playthroughId !== watching.playthroughId;
  const watchedOpen = isWatchedOpen(watching, open);
  const name = watching?.name;
  useEffect(() => {
    if (!otherCampaign) return;
    stopWatching();
    // Without campaign analysis, a write is not read in full until the file opens.
    if (watchedOpen && name) toast.info(otherCampaignText(name));
  }, [otherCampaign, watchedOpen, name]);

  const entryId = watching?.entryId;
  useEffect(() => {
    if (!entryId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        // A read of an earlier loop can still run, such as after a quick stop and start.
        await (reading ??= readWrite(() => latest.current).finally(() => (reading = null)));
      } catch (error) {
        captureException(error, { tags: { msg: "file-watcher" } });
      } finally {
        if (!stopped) timer = setTimeout(poll, POLL_MS);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [entryId]);

  return null;
}

type WatchContext = {
  store: Eu4Store;
  open: OpenSave | null;
  /** The key of the save that campaign navigation opens now. */
  opening: string | null;
  keepFigures: boolean;
};

async function readWrite(context: () => WatchContext) {
  const watching = useEu4Watch.getState().watching;
  if (!watching) return;
  // The player can stop the watch, or open another campaign, during a read.
  const current = () =>
    useEu4Watch.getState().watching?.session === watching.session &&
    context().open?.playthroughId === watching.playthroughId;
  const update = (patch: Partial<WatchedFile>) =>
    useEu4Watch.setState((state) =>
      state.watching?.session === watching.session
        ? { watching: { ...state.watching, ...patch } }
        : state,
    );
  const entry = localSaveRegistry.get(watching.entryId);
  const handle = entry?.ref.kind === "handle" ? entry.ref.file : null;
  const file = handle && (await handle.getFile().catch(() => null));
  if (!entry || !handle || !file) {
    update({ unreadable: true });
    return;
  }
  const version = fileVersion(file);
  const failedBefore = (x: FileVersion | null) => !!x && sameFileVersion(x, version);
  if (watching.unreadable) update({ unreadable: false });
  const written = !watching.startVersion || !sameFileVersion(watching.startVersion, version);
  if (file.lastModified !== watching.lastWrite || (written && !watching.firstWriteRead))
    update({ lastWrite: file.lastModified, firstWriteRead: watching.firstWriteRead || written });
  const stop = () => {
    if (!current()) return;
    stopWatching();
    toast.info(otherCampaignText(watching.name));
  };

  const { store, open, opening, keepFigures } = context();
  const parsed = store.getState().save.fileVersion;
  const viewBehind = !parsed || !sameFileVersion(parsed, version);
  if (isWatchedOpen(watching, open) && viewBehind && opening === null) {
    if (failedBefore(failed.view)) return;
    const result = await getEu4Worker()
      .eu4Reparse(handle, file, watching.playthroughId, keepFigures)
      .catch((error: unknown) => {
        // The game can still be writing the file. The next write is read again.
        failed.view = version;
        update({ writing: true });
        captureException(error, { tags: { msg: "file-watcher" } });
        return null;
      });
    if (result?.kind === "otherCampaign") return stop();
    // The worker has the write now, so the view follows it even if the watch stopped.
    if (result?.kind === "updated" && context().store === store) {
      update({ writing: false });
      emitEvent({ kind: "Save parsed", game: "eu4", source: "watched" });
      const { meta, achievements, fileVersion, snapshot } = result;
      if (snapshot && current()) parsedWrite = { version, snapshot };
      const countries = await getEu4Worker().eu4GetCountries();
      if (context().store === store)
        await store.getState().actions.updateSave({ meta, achievements, fileVersion, countries });
    }
  }

  // Without kept figures, the registry reads the date of a write, which the campaign shows.
  const readDate = async () => {
    const registered = localSaveRegistry.get(entry.id);
    if (isWatchedOpen(watching, context().open) || !registered?.version) return;
    if (!sameFileVersion(registered.version, file)) await localSaveRegistry.verify(entry.id);
  };
  // A paused campaign, such as after a failure or Stop, keeps no new figures until it resumes.
  const history = useEu4History.getState();
  const keep =
    keepFigures &&
    history.analysisEnabledCampaigns.includes(watching.playthroughId) &&
    !isAnalysisPaused(history, watching.playthroughId);
  if (!keep) return readDate();
  const read = history.sources[entry.id];
  if (read && sameFileVersion(read.version, version) && current()) {
    // Analysis read the file before the watch began: that state starts the run.
    const adopted = adoptWatchStart(history, entry, watching.session);
    if (adopted) useEu4History.setState(adopted);
  }
  if ((read && sameFileVersion(read.version, version)) || failedBefore(failed.figures))
    return readDate();
  if (!current()) return;
  // The file as the player opened it starts the run; the game did not go back.
  const start =
    !!watching.startVersion &&
    sameFileVersion(watching.startVersion, version) &&
    !Object.values(history.points).some((x) => x.session === watching.session);
  // A write that the viewer parsed is not parsed again.
  const ready = parsedWrite && sameFileVersion(parsedWrite.version, version) ? parsedWrite : null;
  // An append sends the snapshot's bytes away, so only a busy import keeps it for a retry.
  const outcome = await importEu4Write(
    entry,
    file,
    watching.playthroughId,
    watching.session,
    start,
    ready?.snapshot,
  ).catch((error: unknown) => {
    parsedWrite = null;
    throw error;
  });
  if (outcome.kind !== "busy") parsedWrite = null;
  switch (outcome.kind) {
    case "otherCampaign":
      return stop();
    case "full":
      failed.figures = version;
      update({ figuresError: outcome.error });
      return readDate();
    case "failed":
      failed.figures = version;
      update({ writing: true });
      return readDate();
    case "busy":
      return readDate();
    case "branched":
      if (current() && !start) branchedToast(store, watching.playthroughId, outcome);
      update({ figuresError: null, writing: false });
      return;
    case "added":
    case "replaced":
    case "duplicate":
      update({ figuresError: null, writing: false });
      return;
  }
}

/** The game went back: the later points stay on another branch, which Show it selects. */
function branchedToast(
  store: Eu4Store,
  playthroughId: PlaythroughId,
  { id, tip, left }: Extract<WriteClass, { kind: "branched" }>,
) {
  const snapshot = useEu4History.getState().snapshots.find((x) => x.id === id);
  if (!snapshot) return;
  toast.info(`The game went back to ${formatLongDate(descriptorDate(snapshot))}.`, {
    description:
      left === 1
        ? "Its later save stays on another branch."
        : `Its ${left} later saves stay on another branch.`,
    action: {
      label: "Show it",
      onClick: () => {
        selectSave(playthroughId, pointKey(useEu4History.getState(), tip));
        store.getState().actions.setCampaignSheet({ open: true });
      },
    },
  });
}
