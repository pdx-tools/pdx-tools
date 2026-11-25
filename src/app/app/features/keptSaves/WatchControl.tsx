import { useEffect } from "react";
import { cx } from "class-variance-authority";
import { GameButton } from "@/components/game";
import { Popover } from "@/components/Popover";
import { Tooltip } from "@/components/Tooltip";
import { formatLongDate, sameDate } from "@/features/timeline/date";
import { useKept } from "./keptStore";
import { StatusIcon } from "./StatusIcon";
import { watchStatus } from "./status";
import type { WatchStatus } from "./status";
import { eu4Commit, gamePanel } from "./styles";
import { formatClock } from "./text";
import { setWatchOpen, useKeptUi } from "./ui";
import { useWatchView } from "./useWatchFollow";
import type { WatchView } from "./useWatchFollow";
import { act, resumeWatch } from "./watchService";
import { WatchPopover } from "./WatchPopover";

export function useWatchStatus(view: WatchView): WatchStatus {
  const state = useKept();
  return watchStatus(view.open.game, state, {
    failed: view.failed?.date ?? null,
    loading: view.loading?.date ?? null,
  });
}

/** The view that has a watch to show. A visitor of an upload has no save to watch. */
export function useShownWatch(): WatchView | null {
  const view = useWatchView();
  const hasWatch = useKept((state) => view !== null && view.open.game in state.watches);
  return view?.open.source.kind === "upload" && !hasWatch ? null : view;
}

/** The watch of the game, next to the campaign steps of a panel. */
export function WatchControl() {
  const view = useShownWatch();
  return view && <WatchControlContent view={view} />;
}

function WatchControlContent({ view }: { view: WatchView }) {
  const isOpen = useKeptUi((state) => state.watchOpen);
  const status = useWatchStatus(view);
  const hasAction = view.latest !== null || view.back !== null || view.failed !== null;
  const isOff = status.kind === "off";
  const text = hasAction ? status.short : status.text;

  return (
    <div
      role="group"
      aria-label="Watch"
      className="flex min-h-7 min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1"
    >
      <Popover open={isOpen} onOpenChange={setWatchOpen}>
        <Tooltip>
          <Tooltip.Trigger asChild>
            <Popover.Trigger asChild>
              <GameButton
                variant={isOff ? "default" : "ghost"}
                aria-label={isOff ? status.text : `${sentence(status.full)} Watch settings`}
                className={cx(
                  !isOff && "-ml-1.5 px-1.5!",
                  status.isWarning ? "text-game-warn!" : "text-game-ink-100!",
                )}
              >
                <StatusIcon status={status} />
                {text}
              </GameButton>
            </Popover.Trigger>
          </Tooltip.Trigger>
          {/* While a save loads, the step button says which one. */}
          {status.full !== text && !isOpen && status.kind !== "loading" && (
            <Tooltip.Content side="top" className="max-w-64 text-xs">
              {status.full}
            </Tooltip.Content>
          )}
        </Tooltip>
        <WatchPanel view={view} status={status} side="right" align="start" sideOffset={10} />
      </Popover>
      <WatchAction view={view} status={status} />
      <WatchAnnouncement view={view} status={status} />
    </div>
  );
}

/** The content of the popover that a watch control opens. */
export function WatchPanel({
  view,
  status,
  children,
  ...props
}: { view: WatchView; status: WatchStatus } & React.ComponentProps<typeof Popover.Content>) {
  // Another view must not open with this popover.
  useEffect(() => () => setWatchOpen(false), []);
  return (
    <Popover.Content
      collisionPadding={16}
      className={cx(
        "max-h-[80vh] w-[330px] max-w-[calc(100vw-32px)] overflow-y-auto",
        gamePanel,
        eu4Commit,
      )}
      {...props}
    >
      <WatchPopover view={view} status={status} />
      {children}
    </Popover.Content>
  );
}

export function WatchAnnouncement({ view, status }: { view: WatchView; status: WatchStatus }) {
  const { latest } = view;
  return (
    <span role="status" className="sr-only">
      {latest
        ? `${sentence(status.full)} New save, ${formatLongDate(latest.save.date)}`
        : status.full}
    </span>
  );
}

export const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);

/** The one thing that the player can do about the watch now. */
function WatchAction({ view, status }: { view: WatchView; status: WatchStatus }) {
  const { open, latest, back, goingBack } = view;
  if (back !== null) {
    return (
      <GameButton disabled={goingBack} onClick={back}>
        {goingBack ? "Going back" : `Back to ${formatLongDate(open.date)}, loads again`}
      </GameButton>
    );
  }
  if (status.kind === "failed") return <GameButton onClick={view.openLatest}>Try again</GameButton>;
  if (latest !== null) {
    return (
      <GameButton onClick={view.openLatest} disabled={view.loading !== null}>
        Latest <span className="font-game-num tabular-nums">{latestText(view)}</span>
      </GameButton>
    );
  }
  if (status.kind === "paused") {
    return <GameButton onClick={() => act(resumeWatch(open.game))}>Resume watching</GameButton>;
  }
  return null;
}

/** The date of the latest save, with the time of the write on the same date. */
export function latestText({ open, latest }: WatchView): string {
  if (latest === null) return "";
  const { save, write } = latest;
  const time = sameDate(save.date, open.date) ? `, ${formatClock(write.writtenAt)}` : "";
  return formatLongDate(save.date) + time;
}

/** The last save that the watch kept or saw. */
export function useLastWriteText(view: WatchView, status: WatchStatus): string | null {
  const { game } = view.open;
  const keep = useKept((state) => state.watches[game]?.keep);
  const { latest, latestKept } = useKept((state) => state.index);
  const last = (keep ? latestKept : latest).get(game);
  if (status.kind === "off" || status.kind === "paused" || !last?.date) return null;
  const when = `${formatLongDate(last.date)}, ${formatClock(last.writtenAt)}`;
  return `${keep ? "Last kept" : "Last seen"} ${when}`;
}
