import { useMemo, useSyncExternalStore } from "react";
import { getEu5Session } from "./eu5Session";
import type { Eu5SaveInput } from "./types";

export type { Eu5SaveInput } from "./types";

export function useLoadEu5(save: Eu5SaveInput) {
  const session = useMemo(() => getEu5Session(save), [save]);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  return { controller: session.controller, ...snapshot };
}
