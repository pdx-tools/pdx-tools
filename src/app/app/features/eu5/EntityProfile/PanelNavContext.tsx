import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEu5SelectionState } from "../store";
import { getSelectionIdentityKey } from "./selectionIdentity";

export type PanelNavEntry =
  | { kind: "entity"; anchorIdx: number; label: string }
  | { kind: "focus"; locationIdx: number; label: string };

interface PanelNavApi {
  stack: PanelNavEntry[];
  rootLabel: string | undefined;
  top: PanelNavEntry | undefined;
  pushMany: (entries: PanelNavEntry[], rootLabel?: string) => void;
  popTo: (length: number) => void;
  reset: () => void;
}

const PanelNavContext = createContext<PanelNavApi | null>(null);
const EMPTY_STACK: PanelNavEntry[] = [];

export function usePanelNav(): PanelNavApi {
  const ctx = useContext(PanelNavContext);
  if (!ctx) throw new Error("usePanelNav must be used within PanelNavProvider");
  return ctx;
}

export function PanelNavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<PanelNavEntry[]>([]);
  const [rootLabel, setRootLabel] = useState<string | undefined>(undefined);
  const selectionState = useEu5SelectionState();

  const selectionKey = getSelectionIdentityKey(selectionState);
  const prevKeyRef = useRef(selectionKey);
  const selectionChanged = prevKeyRef.current !== selectionKey;
  const effectiveStack = selectionChanged ? EMPTY_STACK : stack;
  const effectiveRootLabel = selectionChanged ? undefined : rootLabel;

  useEffect(() => {
    if (prevKeyRef.current !== selectionKey) {
      prevKeyRef.current = selectionKey;
      setStack([]);
      setRootLabel(undefined);
    }
  }, [selectionKey]);

  const pushMany = useCallback((entries: PanelNavEntry[], nextRootLabel?: string) => {
    if (nextRootLabel != null) {
      setRootLabel(nextRootLabel);
    }
    setStack((s) => [...s, ...entries]);
  }, []);

  const popTo = useCallback((length: number) => {
    setStack((s) => s.slice(0, length));
  }, []);

  const reset = useCallback(() => {
    setStack([]);
    setRootLabel(undefined);
  }, []);

  const api = useMemo<PanelNavApi>(
    () => ({
      stack: effectiveStack,
      rootLabel: effectiveRootLabel,
      top: effectiveStack[effectiveStack.length - 1],
      pushMany,
      popTo,
      reset,
    }),
    [effectiveStack, effectiveRootLabel, pushMany, popTo, reset],
  );

  return <PanelNavContext.Provider value={api}>{children}</PanelNavContext.Provider>;
}
