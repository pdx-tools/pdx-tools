import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSession } from "@/features/account";
import { useEngineActions } from "@/features/engine";
import type { SaveGameInput } from "@/features/engine/engineStore";
import { sameDate } from "@/features/timeline/date";
import { captureException } from "@/lib/captureException";
import { pdxApi } from "@/services/appApi";
import { campaignKeyFor } from "./campaignKey";
import { mergeCampaignSaves } from "./campaignSaves";
import { dropCampaignCarry, setCampaignCarry } from "./carry";
import {
  getLocalSave,
  holdsRef,
  moveLocalSave,
  setCampaignOpening,
  setLocalSaveHeader,
  setLocalSaveProblem,
  useCampaignOpening,
  useLocalSaves,
  useLocalSavesBatch,
} from "./localSaves";
import type { LocalSaveEntry } from "./localSaves";
import { sameCampaign } from "./types";
import type {
  CampaignGame,
  CampaignSave,
  CampaignStepTarget,
  LocalSaveProblem,
  LocalSaveRef,
  OpenResult,
  OpenSave,
  SaveHeader,
} from "./types";

/** What the campaign needs from the game of the open save. */
export type CampaignAdapter = {
  /** Read the header of a save file, without a parse of its gamestate. */
  readHeader: (file: File) => Promise<SaveHeader>;
  /** What the next save of the campaign keeps of the view, such as the map mode. */
  captureCarry: () => unknown | Promise<unknown>;
  /**
   * Stop what would bring back the open save once the next one opens, such
   * as a file watcher.
   */
  leave?: () => Promise<void>;
  /**
   * Start to open the next save in place of the open one, before the page
   * goes to it. The analysis then continues into that save, and the page
   * of the save takes it over. Resolves once the next save is read; rejects
   * when it cannot be read, and the open save then stays.
   */
  handOff?: (target: CampaignStepTarget) => Promise<void>;
};

/** The saves of the open campaign, in date order, and the means to open them. */
export type CampaignNav = {
  game: CampaignGame;
  saves: CampaignSave[];
  /** The index of the open save in `saves`. */
  openIndex: number;
  previous: CampaignSave | null;
  next: CampaignSave | null;
  /** Files that the page still reads the header of. */
  pending: number;
  /** Files of the latest drop or pick that are of another campaign. */
  refused: number;
  /** The server has more uploads of the campaign than it sent. */
  truncated: boolean;
  /** The key of the save that is being opened. */
  opening: string | null;
  /**
   * Open a save of the campaign. Resolves with the reason when the save
   * cannot be opened, such as a file that is gone.
   */
  open: (save: CampaignSave) => Promise<OpenResult>;
};

function toSaveInput(game: CampaignGame, ref: LocalSaveRef): SaveGameInput {
  if (ref.kind === "handle") {
    const data = { kind: "handle" as const, file: ref.handle, name: ref.name };
    return game === "eu4" ? { kind: "eu4", data } : { kind: "eu5", data };
  }
  const data = { kind: "file" as const, file: ref.file };
  return game === "eu4" ? { kind: "eu4", data } : { kind: "eu5", data };
}

async function readEntryFile(entry: LocalSaveEntry): Promise<File> {
  return entry.ref.kind === "handle" ? await entry.ref.handle.getFile() : entry.ref.file;
}

type HeaderReader = { game: CampaignGame; read: CampaignAdapter["readHeader"] };

/**
 * The header reads of the files that the player gave the page. They run
 * one at a time, across remounts of the campaign, so that the save that is
 * open keeps the worker.
 */
const headerReads = {
  /** The reader of the mounted campaign. Null while none is mounted. */
  reader: null as HeaderReader | null,
  /** Entries that wait for a read or have one in flight. */
  queued: new Set<string>(),
  tail: Promise.resolve(),
};

function queueHeaderRead(id: string): void {
  if (headerReads.queued.has(id)) return;
  headerReads.queued.add(id);
  headerReads.tail = headerReads.tail.then(async () => {
    try {
      await readPendingHeader(id);
    } finally {
      headerReads.queued.delete(id);
    }
  });
}

async function readPendingHeader(id: string): Promise<void> {
  // The entry can change while it waits: the open save, a read by a step,
  // or a campaign of another game that is now mounted.
  const entry = getLocalSave(id);
  const reader = headerReads.reader;
  if (entry === undefined || entry.header !== null || entry.problem !== null) return;
  if (reader === null || reader.game !== entry.game) return;

  let file: File;
  try {
    file = await readEntryFile(entry);
  } catch {
    setLocalSaveProblem(id, { kind: "missing" });
    return;
  }

  try {
    setLocalSaveHeader(id, await reader.read(file));
  } catch (error) {
    setLocalSaveProblem(id, { kind: "unreadable" });
    captureException(error, { tags: { msg: "campaign-header" } });
  }
}

/** Read the headers of the files that the campaign does not know yet. */
function usePendingHeaderReads(
  game: CampaignGame,
  entries: LocalSaveEntry[],
  readHeader: CampaignAdapter["readHeader"],
) {
  useEffect(() => {
    const reader: HeaderReader = { game, read: readHeader };
    headerReads.reader = reader;
    return () => {
      if (headerReads.reader === reader) headerReads.reader = null;
    };
  }, [game, readHeader]);

  // After the reader effect, so that a read that starts has the reader.
  useEffect(() => {
    for (const entry of entries) queueHeaderRead(entry.id);
  }, [entries, readHeader]);
}

/**
 * Check that a local file still holds the save of its mark before the page
 * gives up the open save for it. Returns the problem, which the entry then
 * also has, or null when the file holds the save.
 */
async function verifyLocalSave(
  entry: LocalSaveEntry,
  open: OpenSave,
  readHeader: CampaignAdapter["readHeader"],
): Promise<LocalSaveProblem | null> {
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
    file = await entry.ref.handle.getFile();
  } catch {
    return fail({ kind: "missing" });
  }

  // A handle reads what is on disk now, which is a later save when the game
  // wrote over the file.
  let header: SaveHeader;
  try {
    header = await readHeader(file);
  } catch {
    return fail({ kind: "unreadable" });
  }

  if (!sameCampaign(header.campaignId, open.campaignId)) {
    return fail({ kind: "other-campaign" });
  }

  if (entry.header && !sameDate(header.date, entry.header.date)) {
    const problem: LocalSaveProblem = { kind: "moved", from: entry.header.date };
    moveLocalSave(entry.id, header, problem);
    return problem;
  }

  return null;
}

/**
 * The campaign of the open save: its uploads (by the same rule as the feed)
 * and the files that the player gave the page in this session. Saves of
 * the same date are one point; a local file wins over an upload, as it
 * needs no download.
 */
export function useCampaignNav(
  open: OpenSave,
  adapter: CampaignAdapter,
  /** The error of the latest load, which can be of a save that a step opened. */
  loadError: unknown,
): CampaignNav {
  const { game } = open;
  const session = useSession();
  const entries = useLocalSaves();
  const batch = useLocalSavesBatch();
  const opening = useCampaignOpening();
  const navigate = useNavigate();
  const location = useLocation();
  const { fileInput } = useEngineActions();

  const userId =
    open.source.kind === "upload" ? open.source.uploaderId : (session.id?.toString() ?? null);
  const key = campaignKeyFor({
    playthroughId: open.playthroughId,
    multiplayer: open.multiplayer,
    userId,
  });
  const uploads = pdxApi.saves.useCampaign({ game, key: key ?? "", enabled: key !== null });

  const openRef = open.source.kind === "local" ? open.source.ref : null;
  const openEntry = useMemo(
    () => (openRef ? entries.find((entry) => holdsRef(entry, openRef)) : undefined),
    [entries, openRef],
  );

  // The open save is the one file whose header the page has without a read.
  useEffect(() => {
    if (openEntry === undefined) return;
    const header = openEntry.header;
    if (header?.campaignId === open.campaignId && sameDate(header.date, open.date)) return;
    setLocalSaveHeader(openEntry.id, { campaignId: open.campaignId, date: open.date });
  }, [openEntry, open.campaignId, open.date]);

  const openKey =
    open.source.kind === "upload" ? `upload:${open.source.saveId}` : `local:${open.name}`;
  useEffect(() => {
    setCampaignOpening(null);
    return () => setCampaignOpening(null);
  }, [openKey, open.date]);

  // A save that fails to load leaves the open save on screen, so the step
  // to it is over.
  useEffect(() => {
    if (loadError != null) setCampaignOpening(null);
  }, [loadError]);

  const pendingEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.game === game &&
          entry.header === null &&
          entry.problem === null &&
          entry !== openEntry,
      ),
    [entries, game, openEntry],
  );
  usePendingHeaderReads(game, pendingEntries, adapter.readHeader);

  const saves = useMemo(
    () =>
      mergeCampaignSaves({
        open,
        uploads: uploads.data?.saves ?? [],
        entries,
        openEntry,
      }),
    [uploads.data, entries, open, openEntry],
  );

  const openIndex = saves.findIndex((x) => x.isOpen);
  const refused = entries.filter(
    (entry) =>
      entry.game === game &&
      entry.batch === batch &&
      entry !== openEntry &&
      entry.header !== null &&
      !sameCampaign(entry.header.campaignId, open.campaignId),
  ).length;

  /** Give up the open save for `target`: keep its view, then start the next save. */
  const leaveFor = async (target: CampaignStepTarget) => {
    const carry = await adapter.captureCarry();
    if (open.campaignId !== null) setCampaignCarry(game, open.campaignId, carry);
    await adapter.leave?.();
    try {
      await adapter.handOff?.(target);
    } catch (error) {
      dropCampaignCarry();
      throw error;
    }
  };

  const openSave = async (save: CampaignSave): Promise<OpenResult> => {
    if (save.isOpen || opening !== null) {
      return { kind: "busy" };
    }

    setCampaignOpening(save.key);
    try {
      if (save.source.kind === "upload") {
        await leaveFor({
          kind: "upload",
          saveId: save.source.saveId,
          name: save.name,
          uploaderId: save.source.uploaderId,
        });
        await navigate(`/${game}/saves/${save.source.saveId}`, { replace: true });
        return { kind: "opened" };
      }

      const refuse = (problem: LocalSaveProblem): OpenResult => {
        setCampaignOpening(null);
        return { kind: "failed", failure: { kind: "local", problem } };
      };
      const entry = getLocalSave(save.source.entryId);
      if (entry === undefined) return refuse({ kind: "missing" });
      const problem = await verifyLocalSave(entry, open, adapter.readHeader);
      if (problem !== null) return refuse(problem);

      await leaveFor({ kind: "local", ref: entry.ref });
      fileInput(toSaveInput(game, entry.ref));
      // Local saves open over the home page. The upload's permalink is not
      // what is open anymore, so it leaves the history.
      if (location.pathname !== "/") {
        await navigate("/", { replace: true });
      }
      return { kind: "opened" };
    } catch (error) {
      setCampaignOpening(null);
      captureException(error, { tags: { msg: "campaign-open" } });
      return { kind: "failed", failure: { kind: "unavailable" } };
    }
  };

  return {
    game,
    saves,
    openIndex,
    previous: openIndex > 0 ? saves[openIndex - 1] : null,
    next: openIndex >= 0 && openIndex < saves.length - 1 ? saves[openIndex + 1] : null,
    pending: pendingEntries.length,
    refused,
    truncated: uploads.data?.truncated ?? false,
    opening,
    open: openSave,
  };
}
