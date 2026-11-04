import { useMapHistory } from "../history/context";
import { Link } from "react-router";
import { cx } from "class-variance-authority";
import HomeIcon from "@heroicons/react/24/outline/HomeIcon";
import { focusRing } from "@/components/game/focusRing";
import { useEngineActions } from "../../engine";
import { useEu5SaveDate, useEu5PlaythroughName } from "../store";
import { MONTH_ABBR } from "@/features/timeline/date";
import type { Eu5DateComponents } from "@/wasm/wasm_eu5";
import { IconTip } from "../stack/parts";

export function SaveDateReadout({ date }: { date: Eu5DateComponents }) {
  const monthDay = `${MONTH_ABBR[date.month]} ${date.day}`;
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-game-num text-[13px] text-game-ink-300">{date.year}</span>
      <span className="font-game-num text-[12px] text-game-ink-500 tabular-nums">{monthDay}</span>
    </span>
  );
}

export function HomeLink({ className }: { className?: string }) {
  const { resetSaveAnalysis } = useEngineActions();
  return (
    <IconTip label="Return to home">
      <Link
        to="/"
        onClick={resetSaveAnalysis}
        className={cx(
          "flex shrink-0 items-center justify-center rounded text-game-ink-500 transition-colors duration-100 hover:bg-game-panel-hover hover:text-game-ink-100",
          focusRing,
          className,
        )}
        aria-label="Return to home"
      >
        <HomeIcon className="h-4 w-4" />
      </Link>
    </IconTip>
  );
}

export function useShownSaveDate() {
  const loadedDate = useEu5SaveDate();
  return useMapHistory()?.preview?.shown?.date ?? loadedDate;
}

/** The campaign name over the save date, as plain text, for the ⋯ menu. The name wraps in full. */
export function SaveIdentity({ className }: { className?: string }) {
  const saveDate = useShownSaveDate();
  const playthroughName = useEu5PlaythroughName();
  return (
    <span className={cx("min-w-0", className)}>
      <span
        title={playthroughName}
        className="block font-game-ui text-[14px] leading-tight font-medium wrap-anywhere text-game-ink-100"
      >
        {playthroughName}
      </span>
      <SaveDateReadout date={saveDate} />
    </span>
  );
}
