import { Link } from "react-router";
import { HomeIcon } from "@heroicons/react/24/outline";
import { useEngineActions } from "../../engine";
import { useEu5SaveDate, useEu5PlaythroughName } from "../store";
import type { Eu5DateComponents } from "@/wasm/wasm_eu5";

const MONTH_ABBR = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function SaveDateReadout({ date }: { date: Eu5DateComponents }) {
  const monthDay = `${MONTH_ABBR[date.month]} ${date.day}`;
  return (
    <p className="flex items-baseline gap-1">
      <span className="font-serif text-[13px] text-eu5-ink-500">{date.year}</span>
      <span className="font-mono text-[10px] text-eu5-ink-500">{monthDay}</span>
    </p>
  );
}

export function PanelHeader() {
  const { resetSaveAnalysis } = useEngineActions();
  const saveDate = useEu5SaveDate();
  const playthroughName = useEu5PlaythroughName();

  return (
    <header className="flex shrink-0 items-center gap-2.5 border-b border-eu5-line px-3.5 pt-6 pb-2">
      <Link
        to="/"
        onClick={resetSaveAnalysis}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-eu5-ink-500 transition-colors duration-100 hover:bg-eu5-bg-hover hover:text-eu5-ink-100 focus-visible:ring-2 focus-visible:ring-eu5-bronze-300/50 focus-visible:outline-none"
        aria-label="Return to home"
      >
        <HomeIcon className="h-4 w-4" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[17px] leading-tight font-medium text-eu5-ink-100">
          {playthroughName}
        </p>
        <SaveDateReadout date={saveDate} />
      </div>
    </header>
  );
}
