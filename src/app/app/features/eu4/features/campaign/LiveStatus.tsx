import { Button } from "@/components/Button";
import { useIsCampaignAnalysisEnabled } from "@/features/campaign/analysis/useIsCampaignAnalysisEnabled";
import { useEu4OpenSave } from "../../campaign";
import { startWatching, stopWatching, useEu4Watch } from "../../campaignWatch";
import type { WatchedFile } from "../../campaignWatch";

/** The open file, if the browser can read it again, so it can be watched. */
export function useWatchable() {
  const open = useEu4OpenSave();
  if (open?.source.kind !== "local") return null;
  const { ref, entryId } = open.source;
  return ref.kind === "handle" && entryId !== null ? { open, name: ref.name } : null;
}

/**
 * What the watched file is doing, in the title row. It describes the file,
 * never the selected save. Watch is offered here only beside a chart; without
 * one, the next step offers it.
 */
export function LiveStatus({ chart }: { chart: boolean }) {
  const watching = useEu4Watch((state) => state.watching);
  const watchable = useWatchable();
  const keepFigures = useIsCampaignAnalysisEnabled();
  if (watching) return <Watching watching={watching} />;
  if (!chart || !watchable) return null;
  return (
    <Button
      className="h-8 px-3 py-0 text-sm font-normal"
      onClick={() => startWatching(watchable.open, keepFigures)}
    >
      Watch {watchable.name}
    </Button>
  );
}

function Watching({ watching }: { watching: WatchedFile }) {
  const lastWrite = new Date(watching.lastWrite).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const status = watching.unreadable
    ? `can't read ${watching.name}`
    : watching.writing
      ? "being written, trying again when it changes"
      : watching.figuresError
        ? "new figures aren't saved"
        : watching.firstWriteRead
          ? `last write ${lastWrite}`
          : "waiting for the game to save";
  return (
    <span className="flex min-w-0 grow items-center gap-2">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-sky-500" />
      <span
        className="flex min-w-0 flex-col text-sm leading-tight"
        title={watching.figuresError ?? undefined}
      >
        {/* The dot says watching; the file name is never cut. */}
        <span className="font-semibold break-words">
          <span className="sr-only">Watching </span>
          {watching.name}
        </span>
        <span
          role="status"
          className={
            watching.unreadable || watching.writing || watching.figuresError
              ? "text-xs text-amber-700 dark:text-amber-400"
              : "text-xs text-gray-600 dark:text-gray-300"
          }
        >
          {status}
        </span>
      </span>
      <Button className="h-8 shrink-0 px-3 py-0 text-sm font-normal" onClick={stopWatching}>
        Stop
      </Button>
    </span>
  );
}
