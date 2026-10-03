import { useEffect, useEffectEvent, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSession } from "@/features/account";
import { useEngineActions } from "@/features/engine";
import type { SaveGameInput } from "@/features/engine/engineStore";
import { sameDate } from "@/features/timeline/date";
import { captureException } from "@/lib/captureException";
import { pdxApi } from "@/services/appApi";
import { campaignKeyFor } from "./campaignKey";
import { mergeCampaignSaves } from "./campaignSaves";
import { setCampaignCarry } from "./carry";
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
import type { CampaignGame, CampaignSave, LocalSaveRef, OpenSave, SaveHeader } from "./types";

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
   * Open a save of the campaign. Resolves false when the save cannot be
   * opened, such as a file that is gone; the save then has its problem.
   */
  open: (save: CampaignSave) => Promise<boolean>;
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

/** Entries that the header read is busy with, across remounts of the campaign. */
const reading = new Set<string>();

/**
 * Read the headers of the files that the player gave the page, one at a
 * time, so that the save that is open keeps the worker.
 */
function usePendingHeaderReads(entries: LocalSaveEntry[], adapter: CampaignAdapter) {
  const readHeader = useEffectEvent((file: File) => adapter.readHeader(file));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const entry of entries) {
        if (cancelled) return;
        if (reading.has(entry.id)) continue;
        reading.add(entry.id);
        try {
          let file: File;
          try {
            file = await readEntryFile(entry);
          } catch {
            setLocalSaveProblem(entry.id, { kind: "missing" });
            continue;
          }

          try {
            setLocalSaveHeader(entry.id, await readHeader(file));
          } catch (error) {
            setLocalSaveProblem(entry.id, { kind: "unreadable" });
            captureException(error, { tags: { msg: "campaign-header" } });
          }
        } finally {
          reading.delete(entry.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries]);
}

/**
 * Check that a local file still holds the save of its mark before the page
 * gives up the open save for it. Returns false, and sets the problem on the
 * entry, when it does not.
 */
async function verifyLocalSave(
  entry: LocalSaveEntry,
  open: OpenSave,
  adapter: CampaignAdapter,
): Promise<boolean> {
  if (entry.ref.kind === "file") {
    // A `File` is a reference to the file on disk; the browser refuses to
    // read it after the file changes or goes.
    try {
      await entry.ref.file.slice(0, 1).arrayBuffer();
      return true;
    } catch {
      setLocalSaveProblem(entry.id, { kind: "missing" });
      return false;
    }
  }

  let file: File;
  try {
    file = await entry.ref.handle.getFile();
  } catch {
    setLocalSaveProblem(entry.id, { kind: "missing" });
    return false;
  }

  // A handle reads what is on disk now, which is a later save when the game
  // wrote over the file.
  let header: SaveHeader;
  try {
    header = await adapter.readHeader(file);
  } catch {
    setLocalSaveProblem(entry.id, { kind: "unreadable" });
    return false;
  }

  if (header.campaignId !== open.campaignId) {
    setLocalSaveProblem(entry.id, { kind: "other-campaign" });
    return false;
  }

  if (entry.header && !sameDate(header.date, entry.header.date)) {
    moveLocalSave(entry.id, header);
    return false;
  }

  return true;
}

/**
 * The campaign of the open save: its uploads (by the same rule as the feed)
 * and the files that the player gave the page in this session. Saves of
 * the same date are one point; a local file wins over an upload, as it
 * needs no download.
 */
export function useCampaignNav(open: OpenSave, adapter: CampaignAdapter): CampaignNav {
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
  usePendingHeaderReads(pendingEntries, adapter);

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
      entry.header !== null &&
      entry.header.campaignId !== open.campaignId,
  ).length;

  const openSave = async (save: CampaignSave): Promise<boolean> => {
    if (save.isOpen || opening !== null) return false;
    setCampaignOpening(save.key);
    try {
      if (save.source.kind === "upload") {
        setCampaignCarry(game, open.campaignId, await adapter.captureCarry());
        await adapter.leave?.();
        await navigate(`/${game}/saves/${save.source.saveId}`, { replace: true });
        return true;
      }

      const entry = getLocalSave(save.source.entryId);
      if (entry === undefined || !(await verifyLocalSave(entry, open, adapter))) {
        setCampaignOpening(null);
        return false;
      }

      setCampaignCarry(game, open.campaignId, await adapter.captureCarry());
      await adapter.leave?.();
      fileInput(toSaveInput(game, entry.ref));
      // Local saves open over the home page. The upload's permalink is not
      // what is open anymore, so it leaves the history.
      if (location.pathname !== "/") {
        await navigate("/", { replace: true });
      }
      return true;
    } catch (error) {
      setCampaignOpening(null);
      captureException(error, { tags: { msg: "campaign-open" } });
      return false;
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
