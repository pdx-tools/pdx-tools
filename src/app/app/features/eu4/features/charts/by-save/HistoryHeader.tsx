import type { ReactNode } from "react";
import ChevronLeftIcon from "@heroicons/react/20/solid/ChevronLeftIcon";
import ChevronRightIcon from "@heroicons/react/20/solid/ChevronRightIcon";
import { IconButton } from "@/components/IconButton";
import { MONTH_ABBR } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import { MONTH_DAY_SIZERS } from "@/features/timeline/TimelineReadout";

/**
 * The heading of the history chart: the selected date, large, the joined
 * earlier and later buttons, a middle slot for one sentence, and a fixed
 * slot for the open save's tag or the Open save button.
 */
export function HistoryHeader({
  date,
  title,
  earlier,
  later,
  onStep,
  sentence,
  openSlot,
}: {
  date: DateComponents;
  /** The save's file and source, on hover. */
  title: string;
  /** The date of the earlier and later save, or null at an end. */
  earlier: string | null;
  later: string | null;
  onStep: (by: -1 | 1) => void;
  sentence: ReactNode;
  openSlot: ReactNode;
}) {
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 py-1">
      <span className="flex items-baseline gap-2.5 whitespace-nowrap" title={title}>
        <span className="text-[44px] leading-[44px] font-semibold tracking-tight tabular-nums">
          {date.year}
        </span>
        <span className="inline-grid text-xl text-gray-600 dark:text-gray-300">
          {MONTH_DAY_SIZERS}
          <span className="col-start-1 row-start-1">
            {MONTH_ABBR[date.month]} {date.day}
          </span>
        </span>
      </span>
      <span className="flex">
        <IconButton
          shape="square"
          className="rounded-r-none aria-disabled:cursor-default aria-disabled:opacity-50"
          icon={<ChevronLeftIcon className="size-4" aria-hidden />}
          // Not disabled at the end, so a keyboard press there keeps the focus.
          aria-disabled={earlier === null}
          aria-label={earlier ? `Earlier save, ${earlier}` : "Earlier save"}
          // A tooltip at the ends too, so the button keeps its focus.
          tooltip={earlier ? `Earlier save: ${earlier}` : "The earliest save"}
          onClick={() => earlier !== null && onStep(-1)}
        />
        <IconButton
          shape="square"
          className="-ml-px rounded-l-none aria-disabled:cursor-default aria-disabled:opacity-50"
          icon={<ChevronRightIcon className="size-4" aria-hidden />}
          aria-disabled={later === null}
          aria-label={later ? `Later save, ${later}` : "Later save"}
          tooltip={later ? `Later save: ${later}` : "The latest save"}
          onClick={() => later !== null && onStep(1)}
        />
      </span>
      <span
        aria-live="polite"
        className="min-w-0 flex-1 basis-60 text-sm text-gray-700 dark:text-gray-200"
      >
        {sentence}
      </span>
      <span className="ml-auto flex w-28 justify-end">{openSlot}</span>
    </div>
  );
}
