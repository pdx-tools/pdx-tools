import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSession } from "@/features/account";
import { useEngineActions } from "@/features/engine";
import { captureException } from "@/lib/captureException";
import { isAbortError } from "@/lib/abortController";
import { holdKept } from "@/features/keptSaves/watchService";
import { pdxApi } from "@/services/appApi";
import { campaignKeyFor } from "./campaignKey";
import { canOpen, mergeCampaignSaves } from "./campaignSaves";
import { campaignTransitions } from "./transitions";
import type { CampaignCarry, CampaignTransition, CampaignTransitions } from "./transitions";
import { localSaveRegistry, localSaveInput } from "./localSaves";
import type { LocalSaveEntry, LocalSaveRegistry } from "./localSaves";
import type {
  CampaignGame,
  CampaignSave,
  CampaignStepTarget,
  LocalSaveProblem,
  LocalSaveRef,
  OpenFailure,
  OpenResult,
  OpenSave,
} from "./types";

/** Game operations required for campaign navigation. */
export type CampaignAdapter = {
  /** Capture view state before changing saves. */
  captureCarry: () => CampaignCarry | Promise<CampaignCarry>;
  /** Read the open save from its kept copy, without a load. Return false when it has other bytes. */
  adopt: (copy: KeptCopy) => Promise<boolean>;
  /** Learn the hash of the open save, when a load does not. */
  pin?: () => Promise<void>;
  /** Show a later save of the campaign on the same view. */
  update?: (
    entry: LocalSaveEntry,
    isWanted: () => boolean,
  ) => Promise<"updated" | "stale" | "other-version">;
  /** The player watches or records the timeline of the open save. */
  isWorking: () => boolean;
  /** The country of the player, as the game data names it. */
  country: () => Promise<{ flag: string | null; name: string | null }>;
} & (
  | {
      /** The step ends when preparation and navigation finish. */
      completion: "before-navigation";
      /** Load the target. On failure and abort, recover before rejection. */
      prepare: (
        target: CampaignStepTarget,
        options: OpenOptions & { signal: AbortSignal },
      ) => Promise<void>;
    }
  | {
      /** The step ends when the page gets the new save or its load error. */
      completion: "after-navigation";
      prepare?: never;
    }
);

/** With `isWanted`, the map follows the game, and no player chose the save. */
export type OpenOptions = { isWanted?: () => boolean };

export type KeptCopy = {
  /** The file that the open save was opened from. */
  from: LocalSaveRef;
  ref: Extract<LocalSaveRef, { kind: "handle" }>;
  file: File;
  hash: string;
  /** Update the list of saves, in step with the view. */
  commit: () => void;
};

/** Campaign navigation state and operations. */
export type CampaignNav = Readonly<{
  game: CampaignGame;
  saves: readonly CampaignSave[];
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
  /** Report navigation failures without replacing the current save when preparation fails. */
  open: (save: CampaignSave, carry?: CampaignCarry, options?: OpenOptions) => Promise<OpenResult>;
  /** Return to the open save from a load that can be cancelled. */
  cancel: (() => void) | null;
}>;

const stepCancelled = () => new DOMException("The step was cancelled", "AbortError");

/** Identify the open save across changes to local file references. */
function openSaveKey(open: OpenSave | null): string | File | FileSystemFileHandle | null {
  if (open === null) return null;
  return open.source.kind === "upload"
    ? open.source.saveId
    : (open.source.entryId ?? open.source.ref.file);
}

/** Combine uploaded and local saves for the current campaign. */
export function useCampaignNav(
  open: OpenSave | null,
  adapter: CampaignAdapter,
  /** The latest load failure, including a failed campaign step. */
  loadError: unknown,
  services: {
    registry: LocalSaveRegistry;
    transitions: CampaignTransitions;
    /** The address that the browser shows. */
    address?: () => string;
  } = {
    registry: localSaveRegistry,
    transitions: campaignTransitions,
  },
): CampaignNav | null {
  const { registry, transitions, address = () => window.location.href } = services;
  const game = open?.game ?? null;
  const session = useSession();
  const entries = registry.useEntries();
  const opening = transitions.useOpening();
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

  const uploads = pdxApi.saves.useCampaign({
    game: game ?? "eu4",
    key: key ?? "",
    enabled: key !== null,
  });

  const openEntryId = open?.source.kind === "local" ? open.source.entryId : null;
  const openEntry = useMemo(
    () => entries.find((entry) => entry.id === openEntryId && entry.game === game),
    [entries, openEntryId, game],
  );

  const openPlaythroughId = open?.playthroughId ?? null;
  const openDate = open?.date ?? null;

  // Restore the exact identity from the parsed save after entry updates.
  useEffect(() => {
    if (open !== null) registry.observeOpen(open);
  }, [open, openEntry, registry]);

  const openKey = openSaveKey(open);
  useEffect(() => {
    if (adapter.completion !== "after-navigation") return;
    transitions.settle();
  }, [openKey, openDate, adapter.completion, transitions]);

  // A failed load leaves the current save visible and releases its pending step.
  useEffect(() => {
    if (adapter.completion === "after-navigation" && loadError != null) transitions.failed();
  }, [loadError, adapter.completion, transitions]);

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
    for (const entry of pendingEntries) void registry.readIdentity(entry.id);
  }, [pendingEntries, registry]);

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

  const cancelStep = useRef<AbortController | null>(null);
  const leaveFor = async (
    target: CampaignStepTarget,
    transition: CampaignTransition,
    requestedCarry: CampaignCarry | undefined,
    options: OpenOptions & { signal: AbortSignal },
  ): Promise<OpenFailure | null> => {
    const carry = requestedCarry ?? (await adapter.captureCarry());
    options.signal.throwIfAborted();
    if (openPlaythroughId !== null) transition.preserveView(openPlaythroughId, carry);
    if (adapter.completion === "before-navigation") {
      try {
        await adapter.prepare(target, options);
      } catch (error) {
        if (isAbortError(error)) throw error;
        return { kind: "load", error };
      }
    }
    return null;
  };

  const openSave = async (
    save: CampaignSave,
    carry?: CampaignCarry,
    options: OpenOptions = {},
  ): Promise<OpenResult> => {
    const from = open;
    if (from === null) return { kind: "busy" };
    const transition = save.isOpen ? null : transitions.begin(save.key);
    if (transition === null) {
      return { kind: "busy" };
    }

    // A step must not change the input or route after the user goes to another page.
    // The provider can unmount while EU5 replaces its map, so its lifetime is not a signal.
    const controller = new AbortController();
    cancelStep.current = controller;
    const step = { ...options, signal: controller.signal };
    let hold: ReturnType<typeof holdKept> | null = null;

    const startAddress = address();
    const left = () => address() !== startAddress;
    let navigated = false;
    try {
      if (save.source.kind === "upload") {
        const failure = await leaveFor(
          {
            kind: "upload",
            saveId: save.source.saveId,
            name: save.name,
            uploaderId: save.source.uploaderId,
          },
          transition,
          carry,
          step,
        );
        if (failure !== null) return { kind: "failed", failure };
        if (left()) return { kind: "cancelled" };
        await navigate(`/${from.game}/saves/${save.source.saveId}`, { replace: true });
        navigated = true;
        return { kind: "navigated" };
      }

      const refuse = (problem: LocalSaveProblem): OpenResult => ({
        kind: "failed",
        failure: { kind: "local", problem },
      });
      const { entryId } = save.source;
      let entry = entryId === null ? undefined : registry.get(entryId);
      if (entry === undefined) return refuse({ kind: "missing" });
      if (entry.kept !== null) {
        // No tab can delete the copy from here until the page holds it.
        hold = holdKept(entry.kept.hash);
        await hold.granted;
      }
      const problem = await registry.verify(entry.id);
      if (problem !== null) return refuse(problem);
      entry = registry.get(entry.id);
      if (entry === undefined) return refuse({ kind: "missing" });

      const failure = await leaveFor({ kind: "local", ref: entry.ref }, transition, carry, step);
      if (failure !== null) return { kind: "failed", failure };
      if (left()) return { kind: "cancelled" };
      fileInput(localSaveInput(from.game, entry.ref));
      // Use the local route so the address no longer identifies the previous upload.
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
      hold?.release();
      cancelStep.current = null;
      if (!navigated) transition.cancel();
      else if (adapter.completion === "before-navigation") transition.complete();
    }
  };

  // A step to a local save on the same page keeps the open save until it ends.
  const target = saves.find((save) => save.key === opening);
  const canCancel =
    adapter.completion === "before-navigation" &&
    open?.source.kind === "local" &&
    target?.source.kind === "local";
  const cancel = useCallback(() => cancelStep.current?.abort(stepCancelled()), []);

  // Keep the navigation callback stable while using the current save state.
  const latestOpenSave = useRef(openSave);
  useLayoutEffect(() => {
    latestOpenSave.current = openSave;
  });
  const stableOpenSave = useCallback(
    (...args: Parameters<CampaignNav["open"]>) => latestOpenSave.current(...args),
    [],
  );

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
      cancel: canCancel ? cancel : null,
    };
  }, [game, saves, pending, otherCampaign, truncated, opening, stableOpenSave, canCancel, cancel]);
}
