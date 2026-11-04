import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useEu5PlaythroughName } from "../store";
import { HomeLink, SaveDateReadout, useShownSaveDate } from "../control-panel/PanelHeader";
import { SaveOverflowMenu, SaveShareButton } from "../control-panel/SaveMenu";
import { Eu5ShortcutPanel } from "../Eu5ShortcutPanel";
import { FrameSelectionButton, ScreenshotButton } from "./MapTools";

/**
 * The save and the map's tools, on the map. They are about the whole frame and
 * not about the analysis, so they are not in the column. They keep one place when
 * a level changes the width of the column. The save's name has the width that it
 * needs, and a long name wraps. A phone has only the save here, and the map row of
 * the sheet has the tools, so that the sheet has the height for its rows.
 */
export function MapBar() {
  const saveDate = useShownSaveDate();
  const name = useEu5PlaythroughName();
  const wide = useBreakpoint("md");
  if (!wide) {
    return (
      <header className="pointer-events-auto absolute top-2 left-2 z-20 flex max-w-[calc(100cqw-16px)] items-center rounded-panel border border-game-line-strong bg-game-panel pr-2.5 font-game-ui shadow-lg">
        <HomeLink className="h-11 w-11" />
        <span className="min-w-0 pr-2 text-[13px] leading-tight font-medium wrap-anywhere text-game-ink-100">
          {name}
        </span>
        <span className="shrink-0">
          <SaveDateReadout date={saveDate} />
        </span>
      </header>
    );
  }
  return (
    <header className="pointer-events-auto absolute top-1.5 right-2 z-40 flex max-w-[calc(100cqw-16px)] items-center gap-1 rounded-panel border border-game-line-strong bg-game-panel py-0.5 pr-1 pl-1.5 font-game-ui shadow-lg">
      <HomeLink className="h-7 w-7" />
      <span className="min-w-0 px-1 text-[13px] leading-tight font-medium wrap-anywhere text-game-ink-100">
        {name}
      </span>
      <span className="shrink-0 pr-1">
        <SaveDateReadout date={saveDate} />
      </span>
      <Divider />
      <FrameSelectionButton />
      <ScreenshotButton />
      <Divider />
      <SaveShareButton />
      <SaveOverflowMenu />
      <Eu5ShortcutPanel />
    </header>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-game-line-strong" />;
}
