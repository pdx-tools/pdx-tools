import { daysBetween } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import { descriptorDate } from "@/features/campaign/analysis/descriptor";
import type { Eu5SnapshotDescriptor } from "./analysisTypes";

export const mapFrameDate = (frame: Eu5SnapshotDescriptor): DateComponents => descriptorDate(frame);

/** Frame discovery uses published metadata, not another copy of all campaign descriptors. */
export function publishedMapFrames(
  snapshots: readonly Eu5SnapshotDescriptor[],
  campaign: string,
  layout: string,
): Eu5SnapshotDescriptor[] {
  return compatibleMapFrames(
    snapshots.filter((snapshot) => snapshot.artifacts.includes("map")),
    campaign,
    layout,
  );
}

/** Keep the whole known campaign visible while analytical observations arrive. */
export function mapTimelineBounds(
  current: DateComponents,
  frames: readonly Eu5SnapshotDescriptor[],
  knownDates: readonly DateComponents[],
) {
  let start = current;
  let end = current;
  for (const date of [...knownDates, ...frames.map(mapFrameDate)]) {
    if (daysBetween(start, date) < 0) start = date;
    if (daysBetween(end, date) > 0) end = date;
  }
  return { start, end };
}

/** Never paint another campaign or an incompatible terrain/location mapping. */
export function compatibleMapFrames(
  frames: Eu5SnapshotDescriptor[],
  campaign: string,
  layout: string,
) {
  const dates = new Map<number, Eu5SnapshotDescriptor>();
  for (const frame of [...frames].sort((a, b) => a.id.localeCompare(b.id))) {
    if (frame.campaignId === campaign && frame.layoutKey === layout)
      dates.set(frame.dateSort, frame);
  }
  return [...dates.values()].sort((a, b) => a.dateSort - b.dateSort);
}

/** Snap to an actual observation; the importer does not simulate missing dates. */
export function nearestMapFrame(frames: Eu5SnapshotDescriptor[], date: DateComponents) {
  let nearest = 0;
  let distance = Infinity;
  for (let index = 0; index < frames.length; index++) {
    const next = Math.abs(daysBetween(mapFrameDate(frames[index]), date));
    if (next < distance) {
      nearest = index;
      distance = next;
    }
  }
  return nearest;
}
