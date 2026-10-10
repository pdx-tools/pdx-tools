import "@fontsource/public-sans/latin-400.css";
import "@fontsource/public-sans/latin-500.css";
import "@fontsource/public-sans/latin-600.css";
import "@fontsource/public-sans/latin-700.css";
import "@fontsource/public-sans/latin-ext-400.css";
import "@fontsource/public-sans/latin-ext-500.css";
import "@fontsource/public-sans/latin-ext-600.css";
import "@fontsource/public-sans/latin-ext-700.css";
import "@fontsource/public-sans/vietnamese-400.css";
import "@fontsource/public-sans/vietnamese-500.css";
import "@fontsource/public-sans/vietnamese-600.css";
import "@fontsource/public-sans/vietnamese-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import { memo, useEffect, useRef } from "react";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { Eu5ControlPanel } from "./control-panel/Eu5ControlPanel";
import { Eu5InsightPanel, MAP_MODE_TITLES } from "./Eu5InsightPanel";
import { Eu5Loading, Eu5StepProgress } from "./Eu5Loading";
import { developerLog } from "@/lib/log";
import { ogImageUrl } from "@/lib/media";
import {
  useLoadEu5,
  Eu5StoreProvider,
  useEu5SelectionState,
  useEu5CursorHint,
  useEu5Engine,
  useEu5InsightPanelOpen,
  useEu5MapMode,
  useSetEu5InsightPanelOpen,
} from "./store";
import type { Eu5SaveInput } from "./store/types";
import { Eu5CursorTooltip } from "./Eu5CursorTooltip";
import { useCursorPosition } from "@/hooks/useCursorPosition";
import { Eu5ErrorDisplay } from "./Eu5ErrorDisplay";
import { Eu5Toolbar } from "./Eu5Toolbar";
import { Eu5SelectionPill } from "./Eu5SelectionPill";
import { BoxSelectOverlay } from "./BoxSelectOverlay";
import { TimelineBar } from "./timeline/TimelineBar";
import { useCanvasCourierSurface } from "@/lib/canvas_courier";
import type { CanvasCourierHost } from "@/lib/canvas_courier";
import { ChevronLeftIcon } from "@heroicons/react/24/solid";
import type { CursorPosition } from "@/components/CursorTooltip";
import { GameThemeProvider } from "@/components/GameThemeProvider";
import { Eu5CampaignProvider } from "./campaign";

type Eu5UiProps = {
  save: Eu5SaveInput;
};

export const Eu5Ui = ({ save }: Eu5UiProps) => {
  const { host, data, error, loading, stepping } = useLoadEu5(save);
  const { surfaceRef, focus } = useCanvasCourierSurface(host);
  const cursorRef = useCursorPosition(surfaceRef);
  const settled = data !== null || error !== null;

  useEffect(() => {
    focus();
  }, [focus]);

  useEffect(() => {
    if (error !== null) {
      developerLog(`Eu5 surface error: ${error}`);
    }
  }, [error]);

  return (
    <GameThemeProvider theme="eu5">
      <div className="absolute inset-0 bg-game-page" />

      {/* Canvas layer — the session's canvas, which stays from save to save */}
      <div className="absolute inset-0 overflow-hidden" ref={surfaceRef} />

      {/* UI layer — only when data loaded */}
      {data !== null && host !== null ? (
        <Eu5StoreProvider store={data}>
          <Eu5CampaignProvider>
            <Eu5UiContent cursorRef={cursorRef} host={host} busy={stepping} />
          </Eu5CampaignProvider>
        </Eu5StoreProvider>
      ) : null}

      {stepping ? <Eu5StepProgress /> : null}

      {/* The server renders the loader too. */}
      <Eu5Loading
        loading={loading}
        filename={saveFilename(save)}
        done={settled}
        preview={save.kind === "server" ? ogImageUrl(save.saveId, "eu5") : undefined}
      />

      {error !== null ? <Eu5ErrorDisplay error={error} /> : null}
    </GameThemeProvider>
  );
};

const InsightPanelTab = ({ onOpen }: { onOpen: () => void }) => {
  const mapMode = useEu5MapMode();
  const selectionState = useEu5SelectionState();
  const label =
    (selectionState?.isEmpty === false ? selectionState.scopeDisplayName : null) ??
    MAP_MODE_TITLES[mapMode] ??
    "Insights";

  return (
    <div className="pointer-events-auto absolute top-4 right-4 z-20 rounded-panel border border-game-line-strong bg-game-overlay p-1.5 font-game-ui shadow-xl backdrop-blur-md">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${label} panel`}
        className={cx(
          "flex h-7 max-w-56 items-center gap-2 rounded-control px-2 text-game-ink-500 transition-colors duration-150 hover:bg-game-panel-hover hover:text-game-ink-100",
          focusRing,
        )}
      >
        <ChevronLeftIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-game-num text-[11px] tracking-[0.14em] uppercase">
          {label}
        </span>
      </button>
    </div>
  );
};

function saveFilename(save: Eu5SaveInput): string {
  return save.kind === "file" ? save.file.name : save.name;
}

/**
 * Inner component rendered inside Eu5StoreProvider so it can access the store.
 * Manages insight panel open state and auto-opens when selection becomes non-empty.
 */
const Eu5UiContent = ({
  cursorRef,
  host,
  busy,
}: {
  cursorRef: React.RefObject<CursorPosition>;
  host: CanvasCourierHost;
  /** The next save of the campaign loads, and this save no longer takes input. */
  busy: boolean;
}) => {
  const insightOpen = useEu5InsightPanelOpen();
  const setInsightOpen = useSetEu5InsightPanelOpen();
  const selectionState = useEu5SelectionState();
  const cursorHint = useEu5CursorHint();
  const engine = useEu5Engine();
  const wasEmptyRef = useRef(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "Escape" && !busy) {
        void engine.trigger.clearFocusOrSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, busy]);

  useEffect(() => {
    host.setCursor(cursorHint);
  }, [cursorHint, host]);

  useEffect(() => {
    const isEmpty = selectionState?.isEmpty ?? true;
    if (!isEmpty && wasEmptyRef.current) {
      setInsightOpen(true);
    }
    wasEmptyRef.current = isEmpty;
  }, [selectionState, setInsightOpen]);

  return (
    <div
      className="pointer-events-none absolute inset-0"
      inert={busy}
      aria-busy={busy || undefined}
    >
      {/* Left sidebar — always visible */}
      <Eu5ControlPanel />

      {/* Right panel — slides off right edge when closed */}
      <Eu5InsightPanel open={insightOpen} onClose={() => setInsightOpen(false)} />

      {!insightOpen ? <InsightPanelTab onOpen={() => setInsightOpen(true)} /> : null}

      {/* Canvas overlays */}
      <BoxSelectOverlay />
      <Eu5CursorTooltip cursorRef={cursorRef} />
      <Eu5SelectionPill />
      <TimelineBar />
      <Eu5Toolbar />
    </div>
  );
};

export default memo(Eu5Ui);
