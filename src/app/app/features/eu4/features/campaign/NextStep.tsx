import { Button } from "@/components/Button";
import { useIsCampaignAnalysisEnabled } from "@/features/campaign/analysis/useIsCampaignAnalysisEnabled";
import { formatLongDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import { startWatching, useEu4Watch } from "../../campaignWatch";
import { AddSaves } from "./AddSaves";
import { useWatchable } from "./LiveStatus";

/** True where the browser can read a file again, so the game's next save can be watched. */
export const canWatchFiles = () => typeof window !== "undefined" && "showOpenFilePicker" in window;

/**
 * Before a chart: one sentence and the action that leads to the next save.
 * Watch is the primary action where the open file can be read again.
 */
export function NextStep({
  date,
  pause,
  onResume,
}: {
  date: DateComponents | null;
  /** Why reading stopped: Resume is then the one primary action. */
  pause: { text: string; resume: boolean } | null;
  onResume: () => void;
}) {
  const watching = useEu4Watch((state) => state.watching);
  const watchable = useWatchable();
  const keepFigures = useIsCampaignAnalysisEnabled();
  const so = date ? `One save of this campaign so far: ${formatLongDate(date)}.` : null;
  const resume = !!pause?.resume;
  const note = pause && (
    <p role="status" className="flex items-center gap-3 text-amber-700 dark:text-amber-400">
      {pause.text}
      {resume && (
        <Button variant="primary" onClick={onResume}>
          Resume
        </Button>
      )}
    </p>
  );
  if (watching) {
    return (
      <Step title={so}>
        {note}
        {/* While paused, no write is kept, so the chart does not start: the pause line says why. */}
        {!pause && date && (
          <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <span aria-hidden className="size-2 rounded-full bg-gray-700 dark:bg-gray-200" />
            {formatLongDate(date)}
            <span aria-hidden className="w-24 border-t border-dashed border-gray-400" />
            <span
              aria-hidden
              className="size-2 rounded-full border border-dashed border-gray-500"
            />
            Next save
          </p>
        )}
        {!pause && <p>The chart starts at the game&apos;s next save.</p>}
        <AddSaves quiet>Add earlier saves</AddSaves>
      </Step>
    );
  }
  if (watchable) {
    return (
      <Step title={so}>
        {note}
        <p>
          Watch {watchable.name} and each save the game writes adds a point. Or add saves you
          already have.
        </p>
        <span className="flex gap-3">
          <Button
            variant={resume ? "default" : "primary"}
            onClick={() => startWatching(watchable.open, keepFigures)}
          >
            Watch {watchable.name}
          </Button>
          <AddSaves />
        </span>
      </Step>
    );
  }
  return (
    <Step title={so}>
      {note}
      <p>
        {canWatchFiles()
          ? "Add saves you already have, and each adds a point."
          : "Drop each new save on the page, or add saves you already have, and each adds a point."}
      </p>
      <AddSaves primary={!resume} />
    </Step>
  );
}

/** Without campaign figures, the sheet only watches the open file. */
export function WatchStep() {
  const watching = useEu4Watch((state) => state.watching);
  const watchable = useWatchable();
  if (watching) return <p className="text-sm">The map follows each save the game writes.</p>;
  if (!watchable)
    return (
      <p className="text-sm">
        {canWatchFiles()
          ? "This browser can't watch this file; open it with the file picker to watch it."
          : "This browser can't watch a file for changes. Chrome and other Chromium browsers can."}
      </p>
    );
  return (
    <Step title={null}>
      <p>Watch {watchable.name}, and the map follows each save the game writes.</p>
      <Button
        variant="primary"
        className="self-start"
        onClick={() => startWatching(watchable.open, false)}
      >
        Watch {watchable.name}
      </Button>
    </Step>
  );
}

function Step({ title, children }: { title: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
      {title && (
        <h3 className="m-0 text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      )}
      {children}
    </div>
  );
}
