import { useBreakpoint } from "@/hooks/useBreakpoint";
import { MONTH_ABBR } from "@/features/timeline/date";
import type { Eu5DateComponents } from "@/wasm/wasm_eu5";
import { useEu5Timeline, useEu5PlaythroughName } from "../store";
import { HomeLink, useShownSaveDate } from "../control-panel/PanelHeader";
import { useViewportInsets } from "../useViewportInsets";
import { SaveOverflowMenu } from "../control-panel/SaveMenu";
import { Eu5ShortcutPanel } from "../Eu5ShortcutPanel";
import { FrameSelectionButton, WorldViewButton } from "./MapTools";
import { ShareMenu } from "./ShareMenu";
import { useCampaignTitle, useSavedCountryName } from "./HomeName";

function SavedDate({ date }: { date: Eu5DateComponents }) {
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="font-game-ui text-[12px] text-game-ink-500">Saved</span>
      <span className="font-game-num text-[13px] text-game-ink-300">{date.year}</span>
      <span className="font-game-num text-[12px] text-game-ink-500 tabular-nums">
        {MONTH_ABBR[date.month]} {date.day}
      </span>
    </span>
  );
}

/**
 * The save and the map's tools, on the map. They are about the whole frame and
 * not about the analysis, so they are not in the column. They keep one place when
 * a level changes the width of the column. A phone has only the name here, on one
 * line, because the map has little height and the timeline has the date.
 */
export function MapBar() {
  const saveDate = useShownSaveDate();
  const playthrough = useEu5PlaythroughName();
  const name = useCampaignTitle();
  const as = useSavedCountryName();
  const wide = useBreakpoint("md");
  const timeline = useEu5Timeline();
  const insets = useViewportInsets();
  if (!wide) {
    return (
      <header className="pointer-events-auto absolute top-1.5 left-1.5 z-20 flex h-8 max-w-[calc(100cqw-12px)] items-center rounded-panel border border-game-line-strong bg-game-panel pr-2 font-game-ui shadow-lg">
        <HomeLink className="h-8 w-8" />
        <span
          title={playthrough}
          className="min-w-0 truncate text-[12.5px] leading-tight font-medium text-game-ink-100"
        >
          {name}
          {as ? <span className="font-normal text-game-ink-300"> as {as}</span> : null}
        </span>
        {timeline.available ? null : (
          <span className="ml-2 shrink-0 font-game-num text-[12px] text-game-ink-300">
            {saveDate.year}
          </span>
        )}
      </header>
    );
  }
  return (
    <header
      id="eu5-map-tools"
      tabIndex={-1}
      aria-label="Save and map tools"
      // In the full view the column spans the frame, so the bar has the frame's width.
      style={{ maxWidth: `calc(100cqw - ${Math.min(insets.left, 660) + 16}px)` }}
      className="pointer-events-auto absolute top-1.5 right-2 z-40 flex items-center gap-1 rounded-panel border border-game-line-strong bg-game-panel py-0.5 pr-1 pl-1.5 font-game-ui shadow-lg outline-hidden"
    >
      <HomeLink className="h-7 w-7" />
      <span
        title={playthrough}
        className="min-w-0 px-1 text-[13px] leading-tight font-medium wrap-anywhere text-game-ink-100"
      >
        {name}
        {as ? <span className="font-normal text-game-ink-300"> as {as}</span> : null}
      </span>
      <span className="shrink-0 pr-1 max-[1180px]:hidden">
        <SavedDate date={saveDate} />
      </span>
      <Divider />
      <FrameSelectionButton />
      <WorldViewButton />
      <Divider />
      <ShareMenu />
      <SaveOverflowMenu />
      <Eu5ShortcutPanel />
    </header>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-game-line-strong" />;
}
