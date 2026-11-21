import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSession } from "@/features/account";
import { useEngineActions } from "@/features/engine";
import { captureException } from "@/lib/captureException";
import { isAbortError } from "@/lib/abortController";
import { pdxApi } from "@/services/appApi";
import { campaignKeyFor } from "./campaignKey";
import { canOpen, mergeCampaignSaves } from "./campaignSaves";
import { campaignTransitions } from "./transitions";
import type { CampaignCarry, CampaignTransition, CampaignTransitions } from "./transitions";
import { localSaveRegistry, localSaveInput } from "./localSaves";
import type { LocalSaveRegistry } from "./localSaves";
import type {
  CampaignGame,
  CampaignSave,
  CampaignStepTarget,
  LocalSaveProblem,
  OpenFailure,
  OpenResult,
  OpenSave,
} from "./types";

/** Game operations required for campaign navigation. */
export type CampaignAdapter = {
  /** Capture view state before changing saves. */
  captureCarry: () => CampaignCarry | Promise<CampaignCarry>;
  /** Stop background work that could restore the previous save. */
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
  open: (save: CampaignSave, carry?: CampaignCarry) => Promise<OpenResult>;
}>;

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

  const leaveFor = async (
    target: CampaignStepTarget,
    transition: CampaignTransition,
    requestedCarry?: CampaignCarry,
  ): Promise<OpenFailure | null> => {
    const carry = requestedCarry ?? (await adapter.captureCarry());
    if (openPlaythroughId !== null) transition.preserveView(openPlaythroughId, carry);
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

  const openSave = async (save: CampaignSave, carry?: CampaignCarry): Promise<OpenResult> => {
    const from = open;
    if (from === null) return { kind: "busy" };
    const transition = save.isOpen ? null : transitions.begin(save.key);
    if (transition === null) {
      return { kind: "busy" };
    }

    // A step must not change the input or route after the user goes to another page.
    // The provider can unmount while EU5 replaces its map, so its lifetime is not a signal.
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
      const problem = await registry.verify(entry.id);
      if (problem !== null) return refuse(problem);
      entry = registry.get(entry.id);
      if (entry === undefined) return refuse({ kind: "missing" });

      const failure = await leaveFor({ kind: "local", ref: entry.ref }, transition, carry);
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
      if (!navigated) transition.cancel();
      else if (adapter.completion === "before-navigation") transition.complete();
    }
  };

  // Keep the navigation callback stable while using the current save state.
  const latestOpenSave = useRef(openSave);
  useLayoutEffect(() => {
    latestOpenSave.current = openSave;
  });
  const stableOpenSave = useCallback(
    (save: CampaignSave, carry?: CampaignCarry) => latestOpenSave.current(save, carry),
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
    };
  }, [game, saves, pending, otherCampaign, truncated, opening, stableOpenSave]);
}
