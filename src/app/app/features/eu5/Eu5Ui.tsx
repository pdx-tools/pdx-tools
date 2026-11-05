import { CampaignAnalysisProvider } from "./history/CampaignAnalysisProvider";
import { useMapHistory } from "./history/context";
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
import { memo, useEffect, useState } from "react";
import { Eu5Column } from "./stack/Eu5Column";
import { Eu5Loading, Eu5StepProgress } from "./Eu5Loading";
import { developerLog } from "@/lib/log";
import { ogImageUrl } from "@/lib/media";
import {
  useLoadEu5,
  Eu5StoreProvider,
  useEu5CursorHint,
  useEu5Engine,
  useEu5Players,
} from "./store";
import type { AppEngine } from "./ui-engine";
import type { Eu5SaveInput } from "./store/types";
import { Eu5CursorTooltip } from "./Eu5CursorTooltip";
import { useCursorPosition } from "@/hooks/useCursorPosition";
import { Eu5ErrorDisplay } from "./Eu5ErrorDisplay";
import { BoxSelectOverlay } from "./BoxSelectOverlay";
import { TimelineBar } from "./timeline/TimelineBar";
import { useCanvasCourierSurface } from "@/lib/canvas_courier";
import type { CanvasCourierHost } from "@/lib/canvas_courier";
import type { CursorPosition } from "@/components/CursorTooltip";
import { GameThemeProvider } from "@/components/GameThemeProvider";
import { Eu5CampaignProvider } from "./campaign";

type Eu5UiProps = {
  save: Eu5SaveInput;
};

export const Eu5Ui = ({ save }: Eu5UiProps) => {
  const load = useLoadEu5(save);
  const { host } = load;
  const { surfaceRef, focus } = useCanvasCourierSurface(host);
  const cursorRef = useCursorPosition(surfaceRef);
  const error = load.status === "error" ? load.error : null;
  const stepping = load.status === "success" && load.stepping;
  // The full view covers the map, and the map keeps its camera behind it.
  const [fullView, setFullView] = useState(false);

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

      <div
        ref={surfaceRef}
        data-map-surface
        // The canvas in it is the map's one stop for Tab, with its name and its ring.
        className="absolute inset-0 overflow-hidden [&_canvas:focus-visible]:outline-2 [&_canvas:focus-visible]:-outline-offset-2 [&_canvas:focus-visible]:outline-white [&_canvas:focus-visible]:outline-solid"
      />

      {/* UI layer — only when data loaded */}
      {load.status === "success" && host !== null ? (
        <Eu5StoreProvider store={load.data}>
          <Eu5CampaignProvider>
            <CampaignAnalysisProvider>
              <Eu5UiContent
                cursorRef={cursorRef}
                host={host}
                busy={stepping}
                expanded={fullView}
                onExpand={setFullView}
              />
            </CampaignAnalysisProvider>
          </Eu5CampaignProvider>
        </Eu5StoreProvider>
      ) : null}

      {stepping ? <Eu5StepProgress /> : null}

      <Eu5Loading
        loading={load.status === "pending" ? load.progress : null}
        filename={saveFilename(save)}
        done={load.status !== "pending"}
        preview={save.kind === "server" ? ogImageUrl(save.saveId, "eu5") : undefined}
      />

      {error !== null ? <Eu5ErrorDisplay error={error} /> : null}
    </GameThemeProvider>
  );
};

/**
 * Esc takes off a focus, and then a selection, back to the default scope of the save. A
 * group's save has the players as that scope, so Esc there has nothing to take off.
 */
export async function escapeToDefaultScope(engine: AppEngine, multiplayer: boolean) {
  const before = engine.getState().selectionState;
  const wasEmpty = before == null || before.isEmpty;
  const onlyPlayers = before?.preset === "players" && !before.activeProfile;
  if (multiplayer && onlyPlayers) return;
  await engine.commands.clearFocusOrSelection();
  const after = engine.getState().selectionState;
  if (multiplayer && !wasEmpty && (after == null || after.isEmpty)) {
    await engine.commands.selectPlayers();
  }
}

function saveFilename(save: Eu5SaveInput): string {
  return save.kind === "file" ? save.file.name : save.name;
}

/** Inner component rendered inside Eu5StoreProvider so it can access the store. */
const Eu5UiContent = ({
  cursorRef,
  host,
  busy,
  expanded,
  onExpand,
}: {
  cursorRef: React.RefObject<CursorPosition>;
  host: CanvasCourierHost;
  /** The next save of the campaign loads, and this save no longer takes input. */
  busy: boolean;
  /** The analysis has the frame, and the map waits behind it. */
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
}) => {
  const cursorHint = useEu5CursorHint();
  const engine = useEu5Engine();
  const preview = useMapHistory()?.preview;
  const multiplayer = useEu5Players().length > 1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A menu, a dialog or the column that used the key prevents its default.
      if (event.defaultPrevented) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "Escape" && !busy && !preview) {
        void escapeToDefaultScope(engine, multiplayer);
      }
      if (
        (event.key === "+" || event.key === "=" || event.key === "-") &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        // Plus on a focused row adds that row, and the list has used the key.
        const box = engine.getState().mapViewport;
        if (!box) return;
        const scale = event.key === "-" ? 1.5 : 1 / 1.5;
        const { x, y, width, height } = box.viewport;
        void engine.trigger.fitWorldRect({
          x: x + (width - width * scale) / 2,
          y: y + (height - height * scale) / 2,
          width: width * scale,
          height: height * scale,
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, busy, preview, multiplayer]);

  // The courier makes the canvas, so its name goes on here.
  useEffect(() => {
    const canvas = host.canvas;
    canvas?.setAttribute("role", "application");
    canvas?.setAttribute(
      "aria-label",
      "World map. W, A, S and D pan, plus and minus zoom, and F frames the selection.",
    );
  });

  useEffect(() => {
    host.setCursor(cursorHint);
  }, [cursorHint, host]);

  return (
    <div
      // The column sizes its levels against this frame.
      className="[container-type:size] pointer-events-none absolute inset-0"
      // A save that loads for a preview keeps the timeline usable, also
      // when the playhead moves during the load.
      inert={busy && !preview}
      aria-busy={busy || undefined}
    >
      <Eu5Column onExpand={onExpand} expanded={expanded} />

      {/* Canvas overlays */}
      <BoxSelectOverlay />
      {!preview ? <Eu5CursorTooltip cursorRef={cursorRef} /> : null}
      {!expanded ? <TimelineBar /> : null}
    </div>
  );
};

export default memo(Eu5Ui);
