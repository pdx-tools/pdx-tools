import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import ArchiveBoxArrowDownIcon from "@heroicons/react/16/solid/ArchiveBoxArrowDownIcon";
import ExclamationTriangleIcon from "@heroicons/react/16/solid/ExclamationTriangleIcon";
import EyeIcon from "@heroicons/react/16/solid/EyeIcon";
import PauseIcon from "@heroicons/react/16/solid/PauseIcon";
import { focusRing, GameButton } from "@/components/game";
import { FileSyncIcon } from "@/components/icons/FileSyncIcon";
import { Popover } from "@/components/Popover";
import { Sheet } from "@/components/Sheet";
import { useKept } from "@/features/keptSaves/keptStore";
import type { WatchStatus } from "@/features/keptSaves/status";
import { setWatchOpen, useKeptUi } from "@/features/keptSaves/ui";
import type { WatchView } from "@/features/keptSaves/useWatchFollow";
import { act, resumeWatch } from "@/features/keptSaves/watchService";
import {
  sentence,
  useLastWriteText,
  useShownWatch,
  useWatchStatus,
  WatchAnnouncement,
  WatchPanel,
} from "@/features/keptSaves/WatchControl";
import { Section } from "@/features/keptSaves/WatchPopover";
import { SideBarButton } from "../../components/SideBarButton";
import {
  SideBarContainerProvider,
  useSideBarContainerRef,
} from "../../components/SideBarContainer";
import { useIsServerSaveFile } from "../../store";
import { WatchContent } from "./WatchContent";

const BUTTON_ID = "eu4-watch";

export const WatchSideBarButton = () => {
  const view = useShownWatch();
  const isUpload = useIsServerSaveFile();
  const [ledger, setLedger] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  if (view === null && isUpload) return null;
  const openLedger = () => {
    setWatchOpen(false);
    setLedger(true);
  };
  return (
    <div className="relative">
      {view !== null ? (
        <WatchButton
          view={view}
          button={button}
          isLedgerOpen={ledger}
          onLedger={isUpload ? null : openLedger}
        />
      ) : (
        // Without its playthrough, a save has only the ledger.
        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <SideBarButton ref={button} onClick={openLedger}>
            <span className="text-base">Country ledger</span>
            <FileSyncIcon className="h-8 w-8" />
          </SideBarButton>
        </div>
      )}
      <Sheet modal={false} open={ledger} onOpenChange={setLedger}>
        <SideBarContainerProvider>
          <LedgerSheetContent onClosed={() => button.current?.focus()} />
        </SideBarContainerProvider>
      </Sheet>
    </div>
  );
};

function WatchButton({
  view,
  button,
  isLedgerOpen,
  onLedger,
}: {
  view: WatchView;
  button: React.RefObject<HTMLButtonElement | null>;
  isLedgerOpen: boolean;
  onLedger: (() => void) | null;
}) {
  const isOpen = useKeptUi((state) => state.watchOpen);
  const status = useWatchStatus(view);
  const last = useLastWriteText(view, status);
  const { text, full } = status;

  return (
    <Popover open={isOpen} onOpenChange={setWatchOpen}>
      <div className="flex justify-end overflow-hidden whitespace-nowrap">
        <Popover.Trigger asChild>
          <SideBarButton
            ref={button}
            id={BUTTON_ID}
            aria-label={last ? `${sentence(full)} ${last}` : full}
            className={cx(
              "group/watch shrink-0 outline-none focus-visible:opacity-100",
              status.isWarning && "opacity-100!",
            )}
          >
            <span
              className={cx(
                "text-right",
                // Two lines are as tall as the icon, so the buttons below stay.
                status.kind === "off" ? "text-base" : "w-47 text-sm leading-4 whitespace-normal",
              )}
            >
              {text}
              {last && !status.isWarning && (
                <span className="block text-xs leading-4 text-game-ink-300 tabular-nums">
                  {last}
                </span>
              )}
            </span>
            <span className="relative shrink-0 rounded-sm group-focus-visible/watch:ring-2 group-focus-visible/watch:ring-white">
              <FileSyncIcon className="h-8 w-8" />
              <StateBadge status={status} game={view.open.game} />
            </span>
          </SideBarButton>
        </Popover.Trigger>
      </div>
      {/* The sidebar changes its width while the popover is open. The last anchor counts. */}
      <Popover.Anchor className="pointer-events-none absolute inset-y-0 right-0 w-14" />
      <WatchPanel
        view={view}
        status={status}
        side="left"
        align="start"
        sideOffset={8}
        // The panel stays off the timeline and the label above it.
        collisionPadding={{ top: 16, left: 16, right: 16, bottom: 136 }}
        style={{
          maxWidth: "var(--radix-popover-content-available-width)",
          maxHeight: "var(--radix-popover-content-available-height)",
        }}
        onCloseAutoFocus={(event) => {
          if (isLedgerOpen) event.preventDefault();
        }}
      >
        {onLedger && (
          <Section>
            <GameButton variant="ghost" className="-ml-3" onClick={onLedger}>
              Country ledger
            </GameButton>
          </Section>
        )}
      </WatchPanel>
      <WatchAnnouncement view={view} status={status} />
    </Popover>
  );
}

/** What the notice of the watch says, and what it does when not to open the settings. */
function noticeOf(view: WatchView, status: WatchStatus, phase: string) {
  const resume = () => act(resumeWatch(view.open.game));
  if (status.kind === "no-access") return { text: "Allow access", action: resume };
  // A watch that the player stopped has no notice.
  if (phase === "paused" && status.kind === "paused") {
    return { text: "Resume watching", action: resume };
  }
  if (status.kind === "elsewhere") return { text: "Watching elsewhere" };
  return status.isWarning
    ? { text: status.kind === "near-limit" ? status.text : status.short }
    : null;
}

/**
 * The state beside the closed sidebar, when it needs the player or the button
 * has the keyboard focus. It is after the sidebar, which opens while its content is hovered.
 */
export function WatchNotice() {
  const view = useShownWatch();
  return view && <WatchNoticeContent view={view} />;
}

/** The middle of the button, which the notice is outside of. */
function useButtonCenter(): number {
  const [center, setCenter] = useState(0);
  // The buttons above it can change with the open save.
  useLayoutEffect(() => {
    const measure = () => {
      const button = document.getElementById(BUTTON_ID);
      if (button === null) return;
      const { top, height } = button.getBoundingClientRect();
      setCenter(top + height / 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  return center;
}

function WatchNoticeContent({ view }: { view: WatchView }) {
  const isOpen = useKeptUi((state) => state.watchOpen);
  const phase = useKept(({ live }) => live[view.open.game].phase);
  const status = useWatchStatus(view);
  const top = useButtonCenter();
  if (isOpen) return null;
  const notice = noticeOf(view, status, phase);
  return (
    <button
      type="button"
      data-watch-notice
      // Without a notice, it only shows what the button says.
      aria-hidden={notice === null || undefined}
      tabIndex={notice === null ? -1 : undefined}
      onClick={() => {
        if (notice?.action === undefined) return setWatchOpen(true);
        document.getElementById(BUTTON_ID)?.focus();
        notice.action();
      }}
      className={cx(
        "fixed right-16 z-10 min-h-6 -translate-y-1/2 cursor-pointer rounded-control border border-game-line-strong bg-game-panel-2 px-2 py-1 font-game-ui text-xs whitespace-nowrap peer-hover:hidden",
        focusRing,
        notice === null && "hidden peer-has-[#eu4-watch:focus-visible]:block",
        status.isWarning ? "text-game-warn" : "text-game-ink-100",
      )}
      style={{ top }}
    >
      {notice?.text ?? status.text}
    </button>
  );
}

/** The shape tells the state, as the colors of the sidebar do not. */
function StateBadge({ status, game }: { status: WatchStatus; game: WatchView["open"]["game"] }) {
  const keeps = useKept((state) => state.watches[game]?.keep ?? false);
  const isWatched = useKept((state) => game in state.watches);
  if (!isWatched) return null;
  const Icon = status.isWarning
    ? ExclamationTriangleIcon
    : status.kind === "paused"
      ? PauseIcon
      : keeps && status.kind !== "elsewhere"
        ? ArchiveBoxArrowDownIcon
        : EyeIcon;
  return (
    <Icon
      aria-hidden
      className={cx(
        "absolute -right-1.5 -bottom-1.5 size-5 rounded-full bg-slate-900 p-0.5",
        status.isWarning && "text-game-warn",
      )}
    />
  );
}

const LedgerSheetContent = ({ onClosed }: { onClosed: () => void }) => {
  const sideBarContainerRef = useSideBarContainerRef();
  return (
    <Sheet.Content
      ref={sideBarContainerRef}
      side="right"
      onInteractOutside={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        onClosed();
      }}
      className="flex w-[800px] max-w-full flex-col bg-white pt-4 dark:bg-slate-900"
    >
      <Sheet.Header className="z-10 items-center px-4 pb-4 shadow-md">
        <Sheet.Close />
        <Sheet.Title>Country ledger</Sheet.Title>
      </Sheet.Header>
      <Sheet.Body className="flex flex-col gap-2 px-4 py-6">
        <WatchContent />
      </Sheet.Body>
    </Sheet.Content>
  );
};
