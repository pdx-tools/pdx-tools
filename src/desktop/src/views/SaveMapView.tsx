import {
  useEffect,
  useState,
} from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { getErrorMessage } from "@/lib/getErrorMessage";
import {
  loadSaveForRenderer,
  sendInteractionCursorMoved,
  sendInteractionKey,
  sendInteractionMouseButton,
  sendInteractionMouseWheel,
} from "../lib/tauri";
import type { SaveFileInfo } from "../lib/tauri";

interface SaveMapViewProps {
  save: SaveFileInfo;
  gamePath: string;
  onBack: () => void;
}

export default function SaveMapView({
  save,
  gamePath,
  onBack,
}: SaveMapViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMapReady = !isLoading && !error;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        await loadSaveForRenderer(save.filePath, gamePath);
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [gamePath, save.filePath]);

  useEffect(() => {
    if (isLoading || error) {
      return;
    }

    let queuedCursor: { x: number; y: number } | null = null;
    let cursorRaf = 0;

    const flushCursor = () => {
      cursorRaf = 0;
      if (!queuedCursor) {
        return;
      }

      const { x, y } = queuedCursor;
      queuedCursor = null;
      void sendInteractionCursorMoved(x, y);
    };

    const onMouseMove = (event: MouseEvent) => {
      queuedCursor = { x: event.clientX, y: event.clientY };
      if (cursorRaf === 0) {
        cursorRaf = requestAnimationFrame(flushCursor);
      }
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
      if (event.repeat) {
        return;
      }
      void sendInteractionKey(event.code, true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      void sendInteractionKey(event.code, false);
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const onWindowBlur = () => {
      void sendInteractionMouseButton(0, false);
      void sendInteractionMouseButton(1, false);
      void sendInteractionMouseButton(2, false);

      for (const code of [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowLeft",
        "ArrowDown",
        "ArrowRight",
      ]) {
        void sendInteractionKey(code, false);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", onWindowBlur);
      if (cursorRaf !== 0) {
        cancelAnimationFrame(cursorRaf);
      }
    };
  }, [error, isLoading]);

  return (
    <div
      className={`pointer-events-none relative min-h-screen text-white ${
        isMapReady ? "bg-transparent" : "bg-slate-950"
      }`}
    >
      <div className="pointer-events-auto absolute top-6 left-6 z-50">
        <Button
          data-map-input-stop="true"
          onClick={onBack}
          variant="default"
          className="gap-2 border border-slate-600/70 bg-slate-900/55 backdrop-blur-xl hover:bg-slate-800/65"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to List
        </Button>
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-start justify-center p-8 pt-24">
        {isLoading && (
          <div className="w-full rounded-2xl border border-slate-700/70 bg-slate-900/55 p-8 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <div>
                <p className="text-lg font-semibold text-amber-100">
                  Loading map data...
                </p>
                <p className="text-sm text-slate-300">
                  Parsing save file and processing EU5 game installation in
                  parallel.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-rose-500/50 bg-slate-900/65 p-8 backdrop-blur-xl">
            <h2 className="mb-3 text-2xl font-bold text-rose-200">
              Failed to load save
            </h2>
            <p className="mb-6 text-slate-200">{error}</p>
            <Button onClick={onBack}>Return to List</Button>
          </div>
        )}

        {!isLoading && !error && null}
      </div>
    </div>
  );
}

function normalizeMouseButton(button: number): number | null {
  if (button === 0 || button === 1 || button === 2) {
    return button;
  }
  return null;
}

function wheelEventToLines(event: WheelEvent): number {
  const raw = event.deltaY;
  switch (event.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return -raw;
    case WheelEvent.DOM_DELTA_PAGE:
      return -(raw * 3);
    default:
      return -(raw / 120);
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest("[data-map-input-stop='true']") !== null;
}
