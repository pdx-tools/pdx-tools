import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Eu4Carry } from "@/features/eu4/campaignCarry";
import type { Eu5Carry } from "@/features/eu5/campaignCarry";
import type { CampaignGame, PlaythroughId } from "./types";

type CampaignCarryMap = { eu4: Eu4Carry; eu5: Eu5Carry };
export type CampaignCarry = {
  [Game in CampaignGame]: { game: Game; payload: CampaignCarryMap[Game] };
}[CampaignGame];

export type CampaignTransition = {
  preserveView: (playthroughId: PlaythroughId, view: CampaignCarry) => void;
  complete: () => void;
  cancel: () => void;
};

/** Maximum age of view state retained for the next save. */
export const VIEW_RESTORE_TTL_MS = 5 * 60 * 1000;

type ViewPayload<Game extends CampaignGame> = Extract<CampaignCarry, { game: Game }>["payload"];
type PendingView = CampaignCarry & { playthroughId: PlaythroughId; at: number; token: symbol };

/** Own the opening reservation and view state for save transitions. */
export function createCampaignTransitions() {
  const store = createStore<{ opening: string | null; token: symbol | null }>()(() => ({
    opening: null,
    token: null,
  }));
  let pendingView: PendingView | null = null;

  /** Release the reservation when the page starts or its open save changes. */
  function settle(): void {
    store.setState({ opening: null, token: null });
  }

  function failed(): void {
    pendingView = null;
    settle();
  }

  function begin(key: string): CampaignTransition | null {
    if (store.getState().opening !== null) return null;
    pendingView = null;
    const token = Symbol("campaign transition");
    store.setState({ opening: key, token });
    let ended = false;
    return {
      preserveView(playthroughId: PlaythroughId, view: CampaignCarry): void {
        if (!ended && store.getState().token === token) {
          pendingView = { ...view, playthroughId, at: Date.now(), token };
        }
      },
      complete(): void {
        if (ended) return;
        ended = true;
        if (store.getState().token === token) settle();
      },
      cancel(): void {
        if (ended) return;
        ended = true;
        if (pendingView?.token === token) pendingView = null;
        if (store.getState().token === token) settle();
      },
    };
  }

  /** Consume the pending view once; incompatible saves start with the default view. */
  function takeView<Game extends CampaignGame>(
    game: Game,
    playthroughId: PlaythroughId | null,
  ): ViewPayload<Game> | null;
  function takeView(
    game: CampaignGame,
    playthroughId: PlaythroughId | null,
  ): ViewPayload<CampaignGame> | null {
    const value = pendingView;
    pendingView = null;
    if (value === null || value.game !== game || value.playthroughId !== playthroughId) return null;
    if (Date.now() - value.at > VIEW_RESTORE_TTL_MS) return null;
    return value.payload;
  }

  return {
    begin,
    settle,
    failed,
    takeView,
    useOpening: () => useStore(store, (state) => state.opening),
  };
}

export type CampaignTransitions = ReturnType<typeof createCampaignTransitions>;

export const campaignTransitions = createCampaignTransitions();
