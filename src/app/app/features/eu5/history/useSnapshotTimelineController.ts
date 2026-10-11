import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useCampaign } from "@/features/campaign/CampaignProvider";
import type { CampaignSave } from "@/features/campaign/types";
import { canOpen } from "@/features/campaign/campaignSaves";
import { getLocalSave } from "@/features/campaign/localSaves";
import type { TimelineController } from "@/features/timeline/controller";
import { daysBetween } from "@/features/timeline/date";
import { prepareEu5Session, useEu5MapMode, useEu5PlaythroughId } from "../store";
import { isHistoricalMapMode } from "../ui-engine";
import { useHistory } from "./store";

/** Playback asks the campaign to open saves; it never owns their files or the active date. */
export function useSnapshotTimelineController(): TimelineController | null {
  const campaign = useCampaign();
  const mapMode = useEu5MapMode();
  const visible = !isHistoricalMapMode(mapMode);
  const history = useHistory();
  const playthroughId = useEu5PlaythroughId();
  const preparationAttempts = useRef(new Set<string>());
  const saves = useMemo(
    () => campaign?.saves.filter((save) => save.membership !== "different" && canOpen(save)) ?? [],
    [campaign?.saves],
  );
  const index = saves.findIndex((save) => save.isOpen);
  const previous = saves.findLastIndex((save, i) => i < index && !history.failedSaves[save.key]);
  const next = saves.findIndex((save, i) => i > index && !history.failedSaves[save.key]);
  const choose = useCallback(
    async (save: CampaignSave | undefined) => {
      if (!save || !campaign || campaign.opening || save.isOpen) return;
      const result = await campaign.open(save);
      if (result.kind === "failed") {
        useHistory
          .getState()
          .markFailed(
            save.key,
            `${save.name}: ${result.failure.kind === "load" ? String(result.failure.error) : "Save unavailable"}`,
          );
      } else if (result.kind === "cancelled") useHistory.getState().setPlaying(false);
    },
    [campaign],
  );
  const advance = useEffectEvent(() => void choose(saves[next]));
  useEffect(() => {
    useHistory.getState().setPlaying(false);
    preparationAttempts.current.clear();
  }, [playthroughId, mapMode]);
  useEffect(() => {
    if (!visible || !history.playing || campaign?.opening) return;
    if (next < 0) {
      useHistory.getState().setPlaying(false);
      return;
    }
    const timer = setTimeout(advance, 1200 / history.playbackSpeed);
    return () => clearTimeout(timer);
  }, [visible, history.playing, history.playbackSpeed, campaign?.opening, next, saves]);
  const upcoming = saves[next];
  const upcomingEntry =
    upcoming?.source.kind === "local" ? getLocalSave(upcoming.source.entryId) : undefined;
  const upcomingRef = upcomingEntry?.ref;
  const upcomingVersion =
    upcomingEntry?.version ?? (upcomingRef?.kind === "file" ? upcomingRef.file : undefined);
  const preparationKey = upcomingEntry
    ? `${upcomingEntry.id}:${upcomingVersion?.size}:${upcomingVersion?.lastModified}`
    : undefined;
  useEffect(() => {
    if (!visible || campaign?.opening || !upcomingRef || !preparationKey) return;
    if (preparationAttempts.current.has(preparationKey)) return;
    preparationAttempts.current.add(preparationKey);
    // Optional preparation must not retry a broken save on unrelated metadata updates.
    void prepareEu5Session(upcomingRef).catch(() => {});
  }, [visible, campaign?.opening, upcomingRef, preparationKey]);
  const start = saves[0]?.date;
  const end = saves.at(-1)?.date;
  const open = saves[index];
  const offset = start && open ? daysBetween(start, open.date) : 0;
  const [draftState, setDraftState] = useState({ key: open?.key, value: offset });
  const draft = draftState.key === open?.key ? draftState.value : offset;
  const go = (i: number) => {
    history.setPlaying(false);
    setDraftState({ key: open?.key, value: offset });
    void choose(saves[i]);
  };
  if (!visible || !campaign || !start || !end || !open) return null;
  const nearest = (day: number) => {
    let best = index;
    let distance = Infinity;
    saves.forEach((save, i) => {
      if (history.failedSaves[save.key]) return;
      const candidate = Math.abs(daysBetween(start, save.date) - day);
      if (candidate < distance) {
        best = i;
        distance = candidate;
      }
    });
    return best;
  };
  return {
    navigation: "saves",
    timeline: { available: true, start, end, changeDays: [], changeCounts: [], notes: [] },
    date: open.date,
    live: next < 0,
    playback: history.playing ? "playing" : next < 0 ? "ended" : "paused",
    playing: history.playing,
    locked: !!campaign.opening,
    totalDays: daysBetween(start, end),
    dayOffset: draft,
    mapDayOffset: offset,
    setDayOffset: (day) => {
      history.setPlaying(false);
      setDraftState({ key: open.key, value: day });
    },
    commitDayOffset: (day) => go(nearest(day)),
    setDate: (date) => go(nearest(daysBetween(start, date))),
    step: (_unit, direction) => go(direction === 1 ? next : previous),
    jumpToStart: () => go(saves.findIndex((save) => !history.failedSaves[save.key])),
    jumpToEnd: () => go(saves.findLastIndex((save) => !history.failedSaves[save.key])),
    togglePlayback: () => {
      if (!history.playing && next < 0) {
        void choose(saves.find((save) => !history.failedSaves[save.key]));
      }
      history.setPlaying(!history.playing);
    },
  };
}
