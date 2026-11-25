import type { CampaignGame, CampaignSave } from "@/features/campaign/types";
import { formatLongDate, sameDate } from "@/features/timeline/date";
import { latestInCampaign, useKept } from "./keptStore";
import { formatBytes, formatWhen, listFileText, OVERWRITTEN_OPEN } from "./text";
import type { KeptSave } from "./types";
import { setWatchOpen } from "./ui";
import { useWatchView } from "./useWatchFollow";
import { useKeptFile } from "./useKeptFile";
import { UploadStatus } from "./UploadStatus";

/** What is known about a kept save, in the list of its campaign. */
export function KeptSaveNotes({
  save,
  saves,
  kept,
}: {
  save: CampaignSave;
  saves: readonly CampaignSave[];
  kept: KeptSave;
}) {
  const file = useKeptFile(kept.hash);
  const index = useKept((state) => state.index);
  const { seq } = index.writes.get(kept.hash) ?? {};
  const { game, playthroughId } = kept;
  const isLatest = latestInCampaign(index, game, playthroughId, null)?.seq === seq;
  const back = index.wentBack.get(kept.hash);
  const isBackKept = back !== undefined && index.saves.has(back.hash);
  const sharesDay = saves.some((x) => x.key !== save.key && sameDate(x.date, save.date));
  const when = formatWhen(kept.writtenAt);

  return (
    <div className="mt-0.5 text-xs leading-[1.4] text-game-ink-500">
      <p>
        Kept, {formatBytes(kept.size)}, written{" "}
        {sharesDay ? <strong className="text-game-ink-100">{when}</strong> : when}
        {isLatest && sharesDay && ", latest"}.
      </p>
      {file === "overwritten" && save.isOpen ? (
        <p>{OVERWRITTEN_OPEN}</p>
      ) : (
        file && <p>{listFileText[file]}</p>
      )}
      {back?.date && (
        <p>
          The game went back from {formatLongDate(back.date)}.{isBackKept && " Both are kept."}
        </p>
      )}
      <UploadStatus save={kept} />
    </div>
  );
}

/** Offer copies where a file lost the save that its mark was for. */
export function WatchHint({ game }: { game: CampaignGame }) {
  const view = useWatchView();
  const keeps = useKept((state) => state.watches[game]?.keep ?? false);
  // The watch control is not there for an upload without a watch.
  const hasControl =
    useKept(({ watches }) => game in watches) || view?.open.source.kind === "local";
  if (keeps || !hasControl) return null;
  return (
    <p className="mt-1 text-xs leading-[1.4] text-game-ink-500">
      <button
        type="button"
        className="cursor-pointer text-game-ink-100 underline underline-offset-2"
        onClick={() => setWatchOpen(true)}
      >
        Watch and keep copies
      </button>{" "}
      to open older saves.
    </p>
  );
}
