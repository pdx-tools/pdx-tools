import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useEu5Engine } from "./store";
import type { AppEngine } from "./ui-engine";

export type Eu5MapHoverTarget =
  | { kind: "location"; locationIdx: number }
  | { kind: "country"; countryIdx: number }
  | { kind: "market"; marketId: number };

let nextHoverSourceId = 1;
const hoverStack: Array<{ id: number; target: Eu5MapHoverTarget }> = [];
let appliedHoverTarget: Eu5MapHoverTarget | null = null;

function topHoverTarget() {
  return hoverStack.at(-1)?.target ?? null;
}

function hoverTargetId(target: Eu5MapHoverTarget) {
  switch (target.kind) {
    case "location":
      return target.locationIdx;
    case "country":
      return target.countryIdx;
    case "market":
      return target.marketId;
  }
}

function sameHoverTarget(a: Eu5MapHoverTarget | null, b: Eu5MapHoverTarget | null) {
  return (
    a === b ||
    (a != null && b != null && a.kind === b.kind && hoverTargetId(a) === hoverTargetId(b))
  );
}

function applyHoverTarget(engine: AppEngine, target: Eu5MapHoverTarget | null) {
  if (sameHoverTarget(appliedHoverTarget, target)) {
    return;
  }

  appliedHoverTarget = target;

  if (target) {
    void engine.trigger.highlightMapHoverTarget(target);
  } else {
    void engine.trigger.clearMapHoverHighlight();
  }
}

function upsertHoverSource(id: number, target: Eu5MapHoverTarget) {
  const index = hoverStack.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    hoverStack.splice(index, 1);
  }
  hoverStack.push({ id, target });
}

function removeHoverSource(id: number) {
  const index = hoverStack.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    hoverStack.splice(index, 1);
  }
}

export function useEu5MapHoverSource() {
  const engine = useEu5Engine();
  const sourceId = useRef(0);

  if (sourceId.current === 0) {
    sourceId.current = nextHoverSourceId++;
  }

  const clear = useCallback(() => {
    removeHoverSource(sourceId.current);
    applyHoverTarget(engine, topHoverTarget());
  }, [engine]);

  const highlightTarget = useCallback(
    (target: Eu5MapHoverTarget | null | undefined) => {
      if (target) {
        upsertHoverSource(sourceId.current, target);
      } else {
        removeHoverSource(sourceId.current);
      }
      applyHoverTarget(engine, topHoverTarget());
    },
    [engine],
  );

  useEffect(() => clear, [clear]);

  return useMemo(() => ({ highlightTarget, clear }), [clear, highlightTarget]);
}

export function useEu5MapHoverTarget(target: Eu5MapHoverTarget | null | undefined) {
  const targetRef = useRef(target);
  const hoverSource = useEu5MapHoverSource();

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  const highlight = useCallback(() => {
    hoverSource.highlightTarget(targetRef.current);
  }, [hoverSource]);

  return useMemo(
    () => ({
      onMouseEnter: highlight,
      onMouseLeave: hoverSource.clear,
      onFocus: highlight,
      onBlur: hoverSource.clear,
    }),
    [hoverSource.clear, highlight],
  );
}

export function composeEventHandlers<E extends React.SyntheticEvent>(
  first: ((event: E) => void) | undefined,
  second: ((event: E) => void) | undefined,
) {
  if (!first) return second;
  if (!second) return first;

  return (event: E) => {
    first(event);
    if (!event.isDefaultPrevented()) {
      second(event);
    }
  };
}
