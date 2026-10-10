import { useState } from "react";
import { cx } from "class-variance-authority";
import { Popover } from "@/components/Popover";
import { focusRing } from "@/components/game/focusRing";
import { sectionLabel } from "@/components/game/SectionTitle";
import { daysBetween, formatLongDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import type { SaveLaneGeometry, TimelineCampaign } from "@/features/timeline/TimelineScrubber";
import { useCampaign } from "./CampaignProvider";
import type { CampaignNav } from "./useCampaignNav";
import { saveLabel } from "./saveText";
import { SaveList } from "./SaveList";
import type { CampaignSave } from "./types";

/** Marks closer than this, in px, share one mark. */
const MIN_GAP_PX = 10;
/** The hit area of a mark. */
const MARK_WIDTH = 14;

type Cluster = { x: number; saves: CampaignSave[] };

/** Group the saves into marks that do not overlap at this width. */
function clusterSaves(
  saves: CampaignSave[],
  start: DateComponents,
  px: (day: number) => number,
): Cluster[] {
  const clusters: { xs: number[]; saves: CampaignSave[] }[] = [];
  for (const save of saves) {
    const x = px(daysBetween(start, save.date));
    const last = clusters.at(-1);
    if (last && x - last.xs[0] < MIN_GAP_PX) {
      last.xs.push(x);
      last.saves.push(save);
    } else {
      clusters.push({ xs: [x], saves: [save] });
    }
  }

  return clusters.map(({ xs, saves }) => {
    // A mark that holds the open save sits where the open save is, on the
    // save date terminal.
    const openAt = saves.findIndex((x) => x.isOpen);
    const x = openAt >= 0 ? xs[openAt] : xs.reduce((a, b) => a + b, 0) / xs.length;
    return { x, saves };
  });
}

/**
 * The saves of the campaign for the timeline: the track runs to the latest
 * of them, and each one hangs from it as a mark. Returns undefined when the
 * campaign has only the open save.
 */
export function useTimelineCampaign(
  start: DateComponents | undefined,
): TimelineCampaign | undefined {
  const nav = useCampaign();
  if (nav === null || start === undefined || nav.saves.length < 2) return undefined;
  const latest = nav.saves[nav.saves.length - 1];
  return {
    end: latest.date,
    lane: (geometry) => <SaveMarks nav={nav} start={start} geometry={geometry} />,
  };
}

/**
 * Saves are bookmarks that hang from the track, in their own lane under
 * it; the events of the open save are diamonds on the track. A mark opens
 * a card that offers the save. It never moves the playhead, as the track
 * can only show the history of the open save.
 */
function SaveMarks({
  nav,
  start,
  geometry,
}: {
  nav: CampaignNav;
  start: DateComponents;
  geometry: SaveLaneGeometry;
}) {
  const clusters = clusterSaves(nav.saves, start, geometry.px);
  const ribbonTop = geometry.top + 2;

  return (
    <>
      {/* The thread from the track to each mark. */}
      <svg
        aria-hidden
        width={geometry.width}
        height={ribbonTop}
        className="pointer-events-none absolute inset-x-0 top-0 overflow-visible"
      >
        {clusters.map((cluster) => (
          <line
            key={cluster.saves[0].key}
            x1={cluster.x}
            x2={cluster.x}
            y1={geometry.trackY + 2}
            y2={ribbonTop}
            strokeWidth={1}
            className={
              cluster.saves.some((x) => x.isOpen)
                ? "stroke-game-accent-300/60"
                : "stroke-game-ink-500/40"
            }
          />
        ))}
      </svg>

      {clusters.map((cluster) => (
        <SaveMark key={cluster.saves[0].key} nav={nav} cluster={cluster} top={ribbonTop} />
      ))}
    </>
  );
}

function SaveMark({ nav, cluster, top }: { nav: CampaignNav; cluster: Cluster; top: number }) {
  const [open, setOpen] = useState(false);
  const { saves } = cluster;
  const isOpen = saves.some((x) => x.isOpen);
  const opening = saves.some((x) => x.key === nav.opening);
  const problem = saves.every((x) => x.problem !== null && x.problem.kind !== "moved");
  const label =
    saves.length === 1
      ? saveLabel(saves[0])
      : `${saves.length} saves, ${formatLongDate(saves[0].date)} to ${formatLongDate(saves[saves.length - 1].date)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={isOpen ? `${label}, open now` : label}
          aria-busy={opening || undefined}
          className={cx(
            "group absolute z-10 grid -translate-x-1/2 cursor-pointer place-items-start justify-center rounded-[var(--radius-plate)]",
            focusRing,
          )}
          style={{ left: cluster.x, top, width: MARK_WIDTH, height: 14 }}
        >
          <svg viewBox="0 0 10 13" className="h-[13px] w-[10px] overflow-visible" aria-hidden>
            {saves.length > 1 && (
              <path
                d="M3.5 -1.5 H10.5 V9.5 L7 7 L3.5 9.5 Z"
                className={cx(
                  "transition-colors duration-100",
                  isOpen
                    ? "fill-game-accent-500"
                    : "fill-game-ink-700 group-hover:fill-game-ink-500",
                )}
              />
            )}
            <path
              d="M1 0.5 H8 V12 L4.5 9.5 L1 12 Z"
              strokeWidth={1}
              className={cx(
                "transition-colors duration-100",
                isOpen || opening
                  ? "fill-game-accent-300 stroke-game-accent-300"
                  : problem
                    ? "fill-transparent stroke-game-ink-500 group-hover:stroke-game-ink-100"
                    : "fill-game-ink-300 stroke-game-ink-300 group-hover:fill-game-ink-100 group-hover:stroke-game-ink-100",
                opening && "motion-safe:animate-pulse",
              )}
            />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Content
        side="top"
        sideOffset={10}
        collisionPadding={16}
        className="w-72 max-w-[calc(100vw-32px)] rounded-panel border border-game-line-strong bg-game-panel-2 font-game-ui shadow-xl"
      >
        {saves.length > 1 && <p className={cx("px-3 pt-3", sectionLabel)}>{saves.length} saves</p>}
        <SaveList nav={nav} saves={saves} onOpen={() => setOpen(false)} />
      </Popover.Content>
    </Popover>
  );
}
