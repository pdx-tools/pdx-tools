import { useEffect, useSyncExternalStore } from "react";
import { findEu5Session, getEu5Session, subscribeEu5Session } from "./eu5Session";
import { initialEu5SessionSnapshot } from "./eu5SessionState";
import type { Eu5SaveInput } from "./types";

export type { Eu5SaveInput } from "./types";

const getInitialSnapshot = () => initialEu5SessionSnapshot;
const subscribeInitial = () => () => {};
const getNoSession = () => null;

export function useLoadEu5(save: Eu5SaveInput) {
  // Create the session after the previous page releases its analysis.
  useEffect(() => getEu5Session(save).claim(save), [save]);

  const session = useSyncExternalStore(
    subscribeEu5Session,
    () => findEu5Session(save),
    getNoSession,
  );
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? subscribeInitial,
    session?.getSnapshot ?? getInitialSnapshot,
    getInitialSnapshot,
  );

  return { host: session?.host ?? null, ...snapshot };
}
