import { memo, useEffect, useRef, useState } from "react";
import { Eu5ControlPanel } from "./control-panel/Eu5ControlPanel";
import { Eu5InsightPanel } from "./Eu5InsightPanel";
import { AppLoading } from "@/components/AppLoading";
import { developerLog } from "@/lib/log";
import {
  useLoadEu5,
  Eu5StoreProvider,
  useEu5SelectionState,
  useEu5Engine,
  useEu5InsightPanelOpen,
  useSetEu5InsightPanelOpen,
} from "./store";
import type { Eu5SaveInput } from "./store/types";
import { ProgressBar } from "@/components/ProgressBar";
import { Eu5CursorTooltip } from "./Eu5CursorTooltip";
import { useCursorPosition } from "@/hooks/useCursorPosition";
import { Eu5ErrorDisplay } from "./Eu5ErrorDisplay";
import { Eu5Toolbar } from "./Eu5Toolbar";
import { BoxSelectOverlay } from "./BoxSelectOverlay";
import { useCanvasCourierSurface } from "@/lib/canvas_courier";
import { ChevronLeftIcon } from "@heroicons/react/24/solid";
import type { CursorPosition } from "@/components/CursorTooltip";

type Eu5UiProps = {
  save: Eu5SaveInput;
};

export const Eu5Ui = ({ save }: Eu5UiProps) => {
  const { controller, data, error, loading } = useLoadEu5(save);
  const { canvasRef, surfaceRef, focus } = useCanvasCourierSurface({ controller });
  const cursorRef = useCursorPosition(surfaceRef.current);

  useEffect(() => {
    focus();
  }, [focus, controller]);

  useEffect(() => {
    if (error !== null) {
      developerLog(`Eu5 surface error: ${error}`);
    }
  }, [error]);

  return (
    <>
      {data === null && error === null ? (
        <div className="absolute inset-0">
          <AppLoading />
        </div>
      ) : null}

      {data !== null ? <div className="absolute inset-0 bg-slate-900"></div> : null}

      {/* Canvas layer — always present, always fills viewport */}
      <div className="absolute inset-0 overflow-hidden" ref={surfaceRef}>
        <canvas
          className="h-full w-full touch-none outline-none"
          ref={canvasRef}
          width={600}
          height={400}
          tabIndex={0}
        />
      </div>

      {/* UI layer — only when data loaded */}
      {data !== null ? (
        <Eu5StoreProvider store={data}>
          <Eu5UiContent cursorRef={cursorRef} canvasRef={canvasRef} />
        </Eu5StoreProvider>
      ) : null}

      <div className="absolute w-full">
        {loading !== null ? <ProgressBar height={32} value={loading.percent ?? 0} /> : null}
        {error !== null ? <Eu5ErrorDisplay error={error} /> : null}
      </div>
    </>
  );
};

/**
 * Inner component rendered inside Eu5StoreProvider so it can access the store.
 * Manages insight panel open state and auto-opens when selection becomes non-empty.
 */
const Eu5UiContent = ({
  cursorRef,
  canvasRef,
}: {
  cursorRef: React.RefObject<CursorPosition>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) => {
  const insightOpen = useEu5InsightPanelOpen();
  const setInsightOpen = useSetEu5InsightPanelOpen();
  const selectionState = useEu5SelectionState();
  const engine = useEu5Engine();
  const [boxSelectModifier, setBoxSelectModifier] = useState(false);
  const wasEmptyRef = useRef(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "Escape") {
        void engine.trigger.clearFocusOrSelection();
        return;
      }
      if (event.key === "Shift" || event.key === "Alt" || event.key === "Control") {
        setBoxSelectModifier(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "Shift" || event.key === "Alt" || event.key === "Control") {
        setBoxSelectModifier(false);
      }
    };
    const onBlur = () => setBoxSelectModifier(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [engine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.style.cursor = boxSelectModifier ? "crosshair" : "grab";
  }, [boxSelectModifier, canvasRef]);

  useEffect(() => {
    const isEmpty = selectionState?.isEmpty ?? true;
    if (!isEmpty && wasEmptyRef.current) {
      setInsightOpen(true);
    }
    wasEmptyRef.current = isEmpty;
  }, [selectionState, setInsightOpen]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Left sidebar — always visible */}
      <Eu5ControlPanel />

      {/* Right panel — slides off right edge when closed */}
      <Eu5InsightPanel open={insightOpen} onClose={() => setInsightOpen(false)} />

      {/* Floating button to open right panel — only when closed */}
      {!insightOpen ? (
        <button
          type="button"
          onClick={() => setInsightOpen(true)}
          className="pointer-events-auto absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 backdrop-blur-md transition-colors duration-150 hover:border-white/20 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:outline-none"
          aria-label="Open insights panel"
        >
          <ChevronLeftIcon className="h-4 w-4 text-slate-300" />
        </button>
      ) : null}

      {/* Canvas overlays */}
      <BoxSelectOverlay />
      <Eu5CursorTooltip cursorRef={cursorRef} />
      <Eu5Toolbar />
    </div>
  );
};

export default memo(Eu5Ui);
