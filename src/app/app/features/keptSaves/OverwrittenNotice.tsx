import { formatLongDate } from "@/features/timeline/date";
import { useKeptFile } from "./useKeptFile";
import { useWatchView } from "./useWatchFollow";

/** Say which bytes an upload sends after the game wrote over the open file. */
export function OverwrittenNotice() {
  const view = useWatchView();
  const open = view?.open;
  const hash = open?.source.kind === "local" ? open.source.hash : null;
  const file = useKeptFile(hash);
  if (!view || !open || file !== "overwritten") return null;
  const { latest } = view;
  return (
    <div className="border-2 border-sky-200 bg-sky-100 px-4 py-2 text-sm leading-relaxed text-gray-900">
      <strong>The game has written over {open.name}.</strong> You are looking at the kept copy of{" "}
      {formatLongDate(open.date)}, and Upload sends that copy.
      {latest && ` Latest opens ${formatLongDate(latest.save.date)} when you choose it.`}
    </div>
  );
}
