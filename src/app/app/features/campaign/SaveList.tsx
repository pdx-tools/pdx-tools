import { useLayoutEffect, useRef } from "react";
import { cx } from "class-variance-authority";
import { GameButton, Kbd } from "@/components/game";
import { formatLongDate } from "@/features/timeline/date";
import { openCampaignSave } from "./openSave";
import type { CampaignNav } from "./useCampaignNav";
import { otherCampaignText, saveProblemText, saveSourceText } from "./saveText";
import type { CampaignSave } from "./types";

/**
 * Saves of the campaign as rows that each offer the save, and a note on
 * the keys that step between saves. `onOpen` runs after a save opens.
 */
export function SaveList({
  nav,
  saves,
  onOpen,
  className,
}: {
  nav: CampaignNav;
  saves: CampaignSave[];
  onOpen: () => void;
  className?: string;
}) {
  // The list opens with the open save in view. Later updates of the list,
  // such as a file read, do not move it.
  const listRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    listRef.current?.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <>
      <ul ref={listRef} className={cx("max-h-72 overflow-y-auto py-1", className)}>
        {saves.map((save) => (
          <SaveRow key={save.key} nav={nav} save={save} onOpen={onOpen} />
        ))}
      </ul>
      <p className="flex items-center gap-1 border-t border-game-line px-3 py-2 text-[11px] text-game-ink-500">
        <Kbd>[</Kbd>
        <Kbd>]</Kbd>
        <span className="ml-0.5">previous and next save</span>
      </p>
    </>
  );
}

function SaveRow({
  nav,
  save,
  onOpen,
}: {
  nav: CampaignNav;
  save: CampaignSave;
  onOpen: () => void;
}) {
  const opening = nav.opening === save.key;
  return (
    <li
      aria-current={save.isOpen || undefined}
      className="flex items-start gap-3 border-b border-game-line px-3 py-2.5 last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <p className="font-game-num text-[13px] leading-tight text-game-ink-100 tabular-nums">
          {formatLongDate(save.date)}
        </p>
        <p className="mt-1 truncate text-[12px] leading-tight text-game-ink-300">{save.name}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-game-ink-500">{saveSourceText(save)}</p>
        {save.problem !== null && (
          <p className="mt-1.5 text-[11px] leading-[1.4] text-game-warn">
            {saveProblemText(save.problem)}
          </p>
        )}
        {save.membership === "different" && (
          <p className="mt-1.5 text-[11px] leading-[1.4] text-game-warn">{otherCampaignText}</p>
        )}
      </div>
      {save.isOpen ? (
        <span className="shrink-0 pt-0.5 font-game-num text-[10px] tracking-[0.14em] text-game-accent-300 uppercase">
          Open
        </span>
      ) : (
        <GameButton
          variant="commit"
          className="shrink-0"
          disabled={nav.opening !== null}
          onClick={async () => {
            // A save that cannot be opened keeps the card, which then says why.
            if ((await openCampaignSave(nav, save)).kind === "navigated") onOpen();
          }}
        >
          {opening ? "Opening" : "Open save"}
        </GameButton>
      )}
    </li>
  );
}
