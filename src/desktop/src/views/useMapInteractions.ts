import { useEffect, useRef } from "react";
import {
  sendInteractionCursorMoved,
  sendInteractionKey,
  sendInteractionMouseButton,
  sendInteractionMouseWheel,
} from "../lib/tauri";

export function useMapInteractions(enabled: boolean) {
  const pressedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const abortController = new AbortController();
    const { signal } = abortController;
    let queuedCursor: { x: number; y: number } | null = null;
    let cursorRafId = 0;

    const flushCursor = () => {
      cursorRafId = 0;
      if (!queuedCursor) {
        return;
      }

      const { x, y } = queuedCursor;
      queuedCursor = null;
      void sendInteractionCursorMoved(x, y);
    };

    const queueCursor = (x: number, y: number) => {
      queuedCursor = { x, y };
      if (cursorRafId !== 0) {
        return;
      }

      cursorRafId = requestAnimationFrame(flushCursor);
    };

    const releaseAllInputs = () => {
      void sendInteractionMouseButton(0, false);
      void sendInteractionMouseButton(1, false);
      void sendInteractionMouseButton(2, false);

      for (const code of pressedKeysRef.current) {
        void sendInteractionKey(code, false);
      }
      pressedKeysRef.current.clear();
    };

    const onMouseMove = (event: MouseEvent) => {
      queueCursor(event.clientX, event.clientY);
    };

    const onMouseDown = (event: MouseEvent) => {
      if (isInteractiveTarget(event.target)) {
        return;
      }

      const button = normalizeMouseButton(event.button);
      if (button === null) {
        return;
      }

      void sendInteractionMouseButton(button, true);
    };

    const onMouseUp = (event: MouseEvent) => {
      const button = normalizeMouseButton(event.button);
      if (button === null) {
        return;
      }

      void sendInteractionMouseButton(button, false);
    };

    const onWheel = (event: WheelEvent) => {
      if (isInteractiveTarget(event.target)) {
        return;
      }

      const lines = wheelEventToLines(event);
      if (Math.abs(lines) < Number.EPSILON) {
        return;
      }

      void sendInteractionMouseWheel(lines);
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || pressedKeysRef.current.has(event.code)) {
        return;
      }

      pressedKeysRef.current.add(event.code);
      void sendInteractionKey(event.code, true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!pressedKeysRef.current.delete(event.code)) {
        return;
      }

      void sendInteractionKey(event.code, false);
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("mousemove", onMouseMove, { signal });
    window.addEventListener("mousedown", onMouseDown, { signal });
    window.addEventListener("mouseup", onMouseUp, { signal });
    window.addEventListener("wheel", onWheel, { signal, passive: false });
    window.addEventListener("keydown", onKeyDown, { signal });
    window.addEventListener("keyup", onKeyUp, { signal });
    window.addEventListener("contextmenu", onContextMenu, { signal });
    window.addEventListener("blur", releaseAllInputs, { signal });

    return () => {
      abortController.abort();
      if (cursorRafId !== 0) {
        cancelAnimationFrame(cursorRafId);
      }
      releaseAllInputs();
    };
  }, [enabled]);
}

function normalizeMouseButton(button: number): number | null {
  return button >= 0 && button <= 2 ? button : null;
}

function wheelEventToLines(event: WheelEvent): number {
  if (Math.abs(event.deltaY) < Number.EPSILON) {
    return 0;
  }

  // Match the web EU5 path:
  // wheel => zoom delta (1.1 in / 0.9 out) => converted to scroll lines.
  const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
  if (zoomDelta > 1.0) {
    return Math.log(zoomDelta) / Math.log(1.1);
  }

  return -Math.log(1.0 / zoomDelta) / Math.log(1.1);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest("[data-map-input-stop='true']") !== null;
}
