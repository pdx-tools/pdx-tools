import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSession } from "@/features/account";
import { useEngineActions } from "@/features/engine";
import { sameDate } from "@/features/timeline/date";
import { captureException } from "@/lib/captureException";
import { isAbortError } from "@/lib/abortController";
import { pdxApi } from "@/services/appApi";
import { campaignKeyFor } from "./campaignKey";
import { readSaveIdentity } from "./reader";
import { canOpen, mergeCampaignSaves } from "./campaignSaves";
import { dropCampaignCarry, setCampaignCarry } from "./carry";
import type { CampaignCarry } from "./carry";
import {
  getLocalSave,
  holdsRef,
  localSaveInput,
  moveLocalSave,
  setCampaignOpening,
  beginCampaignOpening,
  fileVersion,
  sameFileVersion,
  setLocalSaveIdentity,
  setLocalSaveProblem,
  useCampaignOpening,
  useLocalSaves,
} from "./localSaves";
import type { LocalSaveEntry } from "./localSaves";
import type {
  CampaignGame,
  CampaignSave,
  CampaignStepTarget,
  LocalSaveProblem,
  OpenFailure,
  OpenResult,
  OpenSave,
  SaveIdentity,
} from "./types";

/** What the campaign needs from the game of the open save. */
export type CampaignAdapter = {
  /** What the next save of the campaign keeps of the view, such as the map mode. */
  captureCarry: () => CampaignCarry | Promise<CampaignCarry>;
  /**
   * Stop what would bring back the open save once the next one opens, such
   * as a file watcher.
   */
  leave?: () => Promise<void>;
} & (
  | {
      /** The step ends when preparation and navigation finish. */
      completion: "before-navigation";
      /** Load the target. On failure, recover before rejection. */
      prepare: (target: CampaignStepTarget) => Promise<void>;
    }
  | {
      /** The step ends when the page gets the new save or its load error. */
      completion: "after-navigation";
      prepare?: never;
    }
);

/** The saves of the open campaign, in date order, and the means to open them. */
export type CampaignNav = {
  game: CampaignGame;
  saves: CampaignSave[];
  /** The index of the open save in `saves`. */
  openIndex: number;
  previous: CampaignSave | null;
  next: CampaignSave | null;
  /** Files that the page still reads the identity of. */
  pending: number;
  /** Saves on the timeline that are of another campaign. */
  otherCampaign: number;
  /** The server has more uploads of the campaign than it sent. */
  truncated: boolean;
  /** The key of the save that is being opened. */
  opening: string | null;
  /**
   * Navigate to a save. Games without preparation can still load after
   * navigation. Return the reason if preparation or navigation fails.
   */
  open: (save: CampaignSave) => Promise<OpenResult>;
};

async function readEntryFile(entry: LocalSaveEntry): Promise<File> {
  return entry.ref.kind === "handle" ? await entry.ref.file.getFile() : entry.ref.file;
}

/** Entries that wait for an identity read or have one in flight. */
const queuedReads = new Set<string>();

function queueIdentityRead(id: string): void {
  if (queuedReads.has(id)) return;
  queuedReads.add(id);
  void readPendingIdentity(id).finally(() => queuedReads.delete(id));
}

async function readPendingIdentity(id: string): Promise<void> {
  let entry = getLocalSave(id);
  if (entry === undefined || entry.identity !== null || entry.problem !== null) return;

  let file: File;
  try {
    file = await readEntryFile(entry);
  } catch {
    setLocalSaveProblem(id, { kind: "missing" });
    return;
  }

  try {
    const identity = await readSaveIdentity(entry.game, file);
    // The open save or a step can give the entry its identity first.
    entry = getLocalSave(id);
    if (entry !== undefined && entry.identity === null) {
      setLocalSaveIdentity(id, identity, fileVersion(file));
    }
  } catch (error) {
    if (getLocalSave(id)?.identity === null) setLocalSaveProblem(id, { kind: "unreadable" });
    captureException(error, { tags: { msg: "campaign-identity" } });
  }
}

/**
 * Check that a local file still holds the save of its mark before the page
 * gives up the open save for it. Returns the problem, which the entry then
 * also has, or null when the file holds the save. A file of another
 * campaign can open; its mark has a warning.
 */
async function verifyLocalSave(entry: LocalSaveEntry): Promise<LocalSaveProblem | null> {
  const fail = (problem: LocalSaveProblem) => {
    setLocalSaveProblem(entry.id, problem);
    return problem;
  };

  if (entry.ref.kind === "file") {
    // A `File` is a reference to the file on disk; the browser refuses to
    // read it after the file changes or goes.
    try {
      await entry.ref.file.slice(0, 1).arrayBuffer();
      return null;
    } catch {
      return fail({ kind: "missing" });
    }
  }

  let file: File;
  try {
    file = await entry.ref.file.getFile();
  } catch {
    return fail({ kind: "missing" });
  }

  // A handle reads what is on disk now, which is a later save when the game
  // wrote over the file. A file that did not change since the page read its
  // identity holds the same save, so it does not need a second read.
  let identity: SaveIdentity;
  if (entry.identity !== null && entry.version !== null && sameFileVersion(file, entry.version)) {
    identity = entry.identity;
  } else {
    try {
      identity = await readSaveIdentity(entry.game, file);
    } catch {
      return fail({ kind: "unreadable" });
    }
  }

  if (entry.identity && !sameDate(identity.date, entry.identity.date)) {
    const problem: LocalSaveProblem = { kind: "moved", from: entry.identity.date };
    moveLocalSave(entry.id, identity, fileVersion(file), problem);
    return problem;
  }

  // The file holds the save of its mark, so a "moved" warning is old. Keep
  // the version of the file, so that the next step to it needs no parse.
  if (entry.version === null || !sameFileVersion(file, entry.version)) {
    setLocalSaveIdentity(entry.id, identity, fileVersion(file));
  } else if (entry.problem !== null) {
    setLocalSaveProblem(entry.id, null);
  }
  return null;
}

/**
 * The campaign of the open save. It has the uploads of the campaign, by
 * the same rule as the feed. It also has the files that the player gave the
 * page in this session. Saves of the same date are one point. A local file that
 * can open wins over an upload, because it needs no download. Without an open
 * save that a campaign can hold, the result is null.
 */
export function useCampaignNav(
  open: OpenSave | null,
  adapter: CampaignAdapter,
  /** The error of the latest load, which can be of a save that a step opened. */
  loadError: unknown,
): CampaignNav | null {
  const game = open?.game ?? null;
  const session = useSession();
  const entries = useLocalSaves();
  const opening = useCampaignOpening();
  const navigate = useNavigate();
  const location = useLocation();
  const { fileInput } = useEngineActions();

  const userId =
    open?.source.kind === "upload" ? open.source.uploaderId : (session.id?.toString() ?? null);
  const key =
    open === null
      ? null
      : campaignKeyFor({
          playthroughId: open.playthroughId,
          multiplayer: open.multiplayer,
          userId,
        });
  // Without a key, the query does not run, so its game has no effect.
  const uploads = pdxApi.saves.useCampaign({
    game: game ?? "eu4",
    key: key ?? "",
    enabled: key !== null,
  });

  const openRef = open?.source.kind === "local" ? open.source.ref : null;
  const openEntry = useMemo(
    () => (openRef ? entries.find((entry) => holdsRef(entry, openRef)) : undefined),
    [entries, openRef],
  );

  const openPlaythroughId = open?.playthroughId ?? null;
  const openCampaignIdHint = open?.campaignIdHint ?? null;
  const openDate = open?.date ?? null;

  // The open save is the one file whose identity the page has without a
  // read, and it is exact: the load parsed the gamestate.
  useEffect(() => {
    if (openEntry === undefined || openDate === null) return;
    const known = openEntry.identity;
    if (
      known?.playthroughId === openPlaythroughId &&
      known.campaignIdHint === openCampaignIdHint &&
      sameDate(known.date, openDate)
    ) {
      return;
    }
    setLocalSaveIdentity(openEntry.id, {
      playthroughId: openPlaythroughId,
      campaignIdHint: openCampaignIdHint,
      date: openDate,
    });
  }, [openEntry, openPlaythroughId, openCampaignIdHint, openDate]);

  const openKey =
    open === null
      ? null
      : open.source.kind === "upload"
        ? `upload:${open.source.saveId}`
        : `local:${open.name}`;
  useEffect(() => {
    if (adapter.completion !== "after-navigation") return;
    setCampaignOpening(null);
    return () => setCampaignOpening(null);
  }, [openKey, openDate, adapter.completion]);

  // A save that fails to load leaves the open save on screen, so the step
  // to it is over.
  useEffect(() => {
    if (adapter.completion === "after-navigation" && loadError != null) setCampaignOpening(null);
  }, [loadError, adapter.completion]);

  const pendingEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.game === game &&
          entry.identity === null &&
          entry.problem === null &&
          entry !== openEntry,
      ),
    [entries, game, openEntry],
  );
  useEffect(() => {
    for (const entry of pendingEntries) queueIdentityRead(entry.id);
  }, [pendingEntries]);

  const saves = useMemo(
    () =>
      open === null
        ? []
        : mergeCampaignSaves({
            open,
            uploads: uploads.data?.saves ?? [],
            entries,
            openEntry,
          }),
    [uploads.data, entries, open, openEntry],
  );

  /** Give up the open save for `target`: keep its view, then start the next save. */
  const leaveFor = async (target: CampaignStepTarget): Promise<OpenFailure | null> => {
    const carry = await adapter.captureCarry();
    if (openPlaythroughId !== null) setCampaignCarry(openPlaythroughId, carry);
    await adapter.leave?.();
    if (adapter.completion === "before-navigation") {
      try {
        await adapter.prepare(target);
      } catch (error) {
        if (isAbortError(error)) throw error;
        return { kind: "load", error };
      }
    }
    return null;
  };

  const openSave = async (save: CampaignSave): Promise<OpenResult> => {
    // The page does not show the campaign without an open save.
    const from = open;
    if (from === null) return { kind: "busy" };
    const finish = save.isOpen ? null : beginCampaignOpening(save.key);
    if (finish === null) {
      return { kind: "busy" };
    }

    let navigated = false;
    try {
      if (save.source.kind === "upload") {
        const failure = await leaveFor({
          kind: "upload",
          saveId: save.source.saveId,
          name: save.name,
          uploaderId: save.source.uploaderId,
        });
        if (failure !== null) return { kind: "failed", failure };
        await navigate(`/${from.game}/saves/${save.source.saveId}`, { replace: true });
        navigated = true;
        return { kind: "navigated" };
      }

      const refuse = (problem: LocalSaveProblem): OpenResult => ({
        kind: "failed",
        failure: { kind: "local", problem },
      });
      const entry = getLocalSave(save.source.entryId);
      if (entry === undefined) return refuse({ kind: "missing" });
      const problem = await verifyLocalSave(entry);
      if (problem !== null) return refuse(problem);

      const failure = await leaveFor({ kind: "local", ref: entry.ref });
      if (failure !== null) return { kind: "failed", failure };
      fileInput(localSaveInput(from.game, entry.ref));
      // Local saves open over the home page. The upload's permalink is not
      // what is open anymore, so it leaves the history.
      if (location.pathname !== "/") {
        await navigate("/", { replace: true });
      }
      navigated = true;
      return { kind: "navigated" };
    } catch (error) {
      if (isAbortError(error)) return { kind: "cancelled" };
      captureException(error, { tags: { msg: "campaign-open" } });
      return { kind: "failed", failure: { kind: "unavailable" } };
    } finally {
      if (!navigated) dropCampaignCarry();
      if (!navigated || adapter.completion === "before-navigation") finish();
    }
  };

  // Consumers get one `open` for the life of the page, which calls the latest
  // closure, so a new closure does not give a new context value.
  const latestOpenSave = useRef(openSave);
  useLayoutEffect(() => {
    latestOpenSave.current = openSave;
  });
  const stableOpenSave = useCallback((save: CampaignSave) => latestOpenSave.current(save), []);

  const pending = pendingEntries.length;
  const otherCampaign = saves.filter((x) => x.membership === "different").length;
  const truncated = uploads.data?.truncated ?? false;
  return useMemo(() => {
    if (game === null) return null;
    const openIndex = saves.findIndex((x) => x.isOpen);
    return {
      game,
      saves,
      openIndex,
      previous: openIndex < 0 ? null : (saves.slice(0, openIndex).findLast(canOpen) ?? null),
      next: openIndex < 0 ? null : (saves.slice(openIndex + 1).find(canOpen) ?? null),
      pending,
      otherCampaign,
      truncated,
      opening,
      open: stableOpenSave,
    };
  }, [game, saves, pending, otherCampaign, truncated, opening, stableOpenSave]);
}
