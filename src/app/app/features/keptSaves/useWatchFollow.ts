import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { captureException } from "@/lib/captureException";
import type { CampaignAdapter, CampaignNav } from "@/features/campaign/useCampaignNav";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { CampaignSave, FileVersion, OpenSave } from "@/features/campaign/types";
import { adoptKeptCopy } from "./adopt";
import { isDomException } from "./bytes";
import { wasNewest } from "./folder";
import { decideFollow } from "./follow";
import { isActive, latestInCampaign, latestOf, useKept } from "./keptStore";
import { hasProtectedWork, isInteracting, trackPointers } from "./protectedWork";
import { holdKept, recordOpened, recordUpload } from "./watchService";
import type { SaveWrite } from "./types";

/** How long the player must be idle before the map changes. */
const CALM_MS = 1000;
const POLL_MS = 200;

export type WatchView = {
  open: OpenSave;
  /** The last write of the campaign, when another save is open. */
  latest: { save: CampaignSave; write: SaveWrite } | null;
  /** The last write of the campaign is too close to the open save for the map. */
  skipped: boolean;
  /** The last write is of another campaign. */
  other: SaveWrite | null;
  loading: CampaignSave | null;
  failed: CampaignSave | null;
  openLatest: () => void;
  /** Return to the save on screen while another one loads. */
  back: (() => void) | null;
  goingBack: boolean;
};

export const WatchViewContext = createContext<WatchView | null>(null);
export const useWatchView = () => useContext(WatchViewContext);

function sourceHash(open: OpenSave | null): string | null {
  return open?.source.kind === "local" ? open.source.hash : null;
}

/** Keep the open save readable after the game writes over its file. */
function useKeptOpenSave(open: OpenSave | null, adapter: CampaignAdapter) {
  const hash = sourceHash(open);
  const kept = useKept(({ index }) => index.saves.get(hash ?? ""));
  const watched = useKept((state) => open !== null && isActive(state.live[open.game]));

  // Some views hash the open file only when it can be followed.
  const pin = useEffectEvent(() => void adapter.pin?.().catch(captureException));
  const unpinned = watched && open?.source.kind === "local" && hash === null;
  const ref = open?.source.kind === "local" ? open.source.ref.file : null;
  useEffect(() => {
    if (unpinned) pin();
  }, [unpinned, ref]);

  const adopt = useEffectEvent(async () => {
    if (open === null || kept === undefined) return;
    if (!(await adoptKeptCopy(open, kept, adapter))) return;
    // The save can be uploaded before its copy exists.
    const uploadedId = localSaveRegistry.findKept(kept.hash)?.uploadedId;
    if (uploadedId && kept.uploadedId === null) await recordUpload(kept.hash, uploadedId);
  });
  const isKept = kept !== undefined;
  useEffect(() => {
    if (!isKept || hash === null) return;
    adopt().catch(captureException);
    // The page input can be another save, whose load failed.
    return holdKept(hash).release;
  }, [isKept, hash, ref]);

  // The view knows more than the read of a save that was not opened.
  const record = useEffectEvent(async () => {
    if (open === null || kept === undefined) return;
    const { flag, name } = await adapter.country();
    await recordOpened(kept.hash, {
      playthroughId: open.playthroughId,
      campaignIdHint: open.campaignIdHint,
      date: open.date,
      flag: flag ?? kept.flag,
      countryName: name ?? kept.countryName,
    });
  });
  const isRead = isKept && kept.identity !== "pending";
  useEffect(() => {
    if (isRead) record().catch(captureException);
  }, [isRead, hash]);
}

/** The save on screen when its following started or ended. */
type Following = {
  key: string | null;
  watchId: string | undefined;
  baseline: SaveWrite | null;
  /** The file of the save, when no later write was seen. */
  version: FileVersion | null;
  /** A follow or Latest opened the save. */
  isArmed: boolean;
};

/** Open the writes of the campaign while the player looks at its last save. */
export function useWatchFollow(
  open: OpenSave | null,
  nav: CampaignNav | null,
  adapter: CampaignAdapter,
): WatchView | null {
  useKeptOpenSave(open, adapter);
  const game = open?.game ?? "eu4";
  const index = useKept((state) => state.index);
  const ready = useKept((state) => state.saves !== null);
  const config = useKept((state) => state.watches[game]);
  const folder = useKept((state) => state.folders[game]);
  const isCaughtUp = useKept(({ live }) => isActive(live[game]) && live[game].isCaughtUp);
  const openHash = sourceHash(open);
  const write = open && latestInCampaign(index, game, open.playthroughId, openHash);
  const last = latestOf(index, game);
  const target = nav?.saves.find((save) => write !== null && save.hash === write.hash) ?? null;
  const isLatest = target === null || target.isOpen || target.hash === openHash;

  const openKey = nav?.saves[nav.openIndex]?.key ?? null;
  const [opened, setOpened] = useState<Following>();
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [skippedSeq, setSkippedSeq] = useState<number | null>(null);
  const [failedSeq, setFailedSeq] = useState<number | null>(null);
  const [isUpdating, setUpdating] = useState(false);
  const [goingBack, setGoingBack] = useState(false);
  if (ready && (opened?.key !== openKey || opened.watchId !== config?.id)) {
    const version = open?.source.kind === "local" ? open.source.fileVersion : null;
    setOpened({
      key: openKey,
      watchId: config?.id,
      baseline: write,
      // The game can write again while a follow opens the save.
      // Without a later write, the files that the watch started with tell the last one.
      version: version && (write?.writtenAt ?? 0) < version.lastModified ? version : null,
      isArmed: shownKey !== null && shownKey === openKey,
    });
    setShownKey(null);
  }
  const isArmed =
    opened !== undefined &&
    open?.source.kind === "local" &&
    (opened.isArmed ||
      (opened.baseline !== null && opened.baseline.hash === openHash) ||
      (opened.version !== null &&
        wasNewest(folder?.newest ?? [], opened.version, open.playthroughId)));
  const disarm = () =>
    setOpened(
      (current) => current && { ...current, baseline: null, version: null, isArmed: false },
    );

  const afterLatest = useRef(false);
  const calmSince = useRef(0);
  const isProtected = () => hasProtectedWork() || adapter.isWorking();

  // A follow asks this again after it waits, as the player can start other work.
  const isStillWanted = useRef<(seq: number) => boolean>(() => false);
  useLayoutEffect(() => {
    isStillWanted.current = (seq) => isArmed && write?.seq === seq && !isProtected();
  });

  const show = async (save: CampaignSave, seq: number, isWanted?: () => boolean) => {
    if (nav === null || save.source.kind !== "local" || save.source.entryId === null) return;
    const entry = localSaveRegistry.get(save.source.entryId);
    setFailedSeq(null);
    setShownKey(save.key);
    try {
      if (isWanted && entry !== undefined && adapter.update !== undefined) {
        const result = await adapter.update(entry, isWanted);
        // Do not try the same write again, as nothing about it changes.
        if (result === "stale" && isWanted()) setFailedSeq(seq);
        if (result !== "other-version") return;
      }
      const result = await nav.open(save, undefined, { isWanted });
      if (result.kind !== "failed") return;
      const { failure } = result;
      const isUnreadable =
        failure.kind === "load" && isDomException(failure.error, "NotReadableError");
      // A save that could not be restored is not left without a click.
      if (isWanted && isUnreadable) disarm();
      else setFailedSeq(seq);
    } catch (error) {
      captureException(error, { tags: { msg: "watch-follow" } });
      setFailedSeq(seq);
    }
  };

  const follow = async (save: CampaignSave, seq: number) => {
    setUpdating(true);
    await show(save, seq, () => isStillWanted.current(seq));
    setUpdating(false);
  };

  const decide = useEffectEvent((): boolean => {
    if (open === null || target === null || write === null || config === undefined) return true;
    if (isInteracting()) calmSince.current = Date.now();
    const decision = decideFollow({
      armed: isArmed,
      pace: config.updateMap,
      open: open.date,
      next: target.date,
      afterLatest: afterLatest.current,
      isProtected: isProtected(),
      isBusy: nav?.opening !== null || Date.now() - calmSince.current < CALM_MS,
    });
    if (decision === "wait") return false;
    if (decision === "skip") setSkippedSeq(write.seq);
    if (decision === "disarm") disarm();
    if (decision === "open") {
      afterLatest.current = false;
      void follow(target, write.seq);
    }
    return true;
  });

  useEffect(trackPointers, []);

  // One update at a time, and only the newest write is its target.
  const pending = isCaughtUp && isArmed && !isLatest && !isUpdating ? (write?.seq ?? null) : null;
  useEffect(() => {
    if (pending === null || pending === failedSeq || decide()) return;
    const timer = setInterval(() => {
      if (decide()) clearInterval(timer);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, failedSeq]);

  const isLoading = nav !== null && nav.opening !== null;
  if (!isLoading && goingBack) setGoingBack(false);
  if (open === null || nav === null) return null;
  const { cancel } = nav;
  return {
    open,
    latest: target !== null && write !== null && !isLatest ? { save: target, write } : null,
    skipped: isArmed && write !== null && skippedSeq === write.seq,
    other: last?.playthroughId && last !== write && index.saves.has(last.hash) ? last : null,
    loading: nav.saves.find((save) => save.key === nav.opening) ?? null,
    failed: !isLatest && write !== null && failedSeq === write.seq ? target : null,
    openLatest: () => {
      if (target === null || write === null) return;
      afterLatest.current = true;
      void show(target, write.seq);
    },
    back:
      cancel === null
        ? null
        : () => {
            setGoingBack(true);
            setShownKey(null);
            disarm();
            cancel();
          },
    goingBack,
  };
}
