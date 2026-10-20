import { useState } from "react";
import { cx } from "class-variance-authority";
import { Popover } from "@/components/Popover";
import { focusRing } from "@/components/game/focusRing";
import { sectionLabel } from "@/components/game/SectionTitle";
import { daysBetween, formatLongDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import type { SaveLaneGeometry, TimelineCampaign } from "@/features/timeline/TimelineScrubber";
import { useCampaignTimeline } from "./CampaignProvider";
import type { CampaignNav } from "./useCampaignNav";
import { saveLabel } from "./saveText";
import { SaveList } from "./SaveList";
import type { CampaignSave } from "./types";
import { saveAnalysisPresentation } from "./saveAnalysisPresentation";
import { SaveAnalysisGlyph } from "./SaveAnalysisGlyph";
import type { SaveAnalysisStatus } from "./saveAnalysisPresentation";

/** Marks closer than this, in px, share one mark. */
const MIN_GAP_PX = 10;

const MARK_WIDTH = 14;

type Cluster = {
  x: number;
  saves: readonly CampaignSave[];
  analysis?: { status: SaveAnalysisStatus; label: string };
};
type AnalysisStatus = (save: CampaignSave) => SaveAnalysisStatus;

function clusterSaves(
  saves: readonly CampaignSave[],
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
    // Keep a cluster with the open save aligned to the current date.
    const openAt = saves.findIndex((x) => x.isOpen);
    const x = openAt >= 0 ? xs[openAt] : xs.reduce((a, b) => a + b, 0) / xs.length;
    return { x, saves };
  });
}

/** A mixed cluster stays active while any save is being analyzed. */
function summarizeAnalysis(saves: readonly CampaignSave[], statusOf: AnalysisStatus) {
  const counts = { ready: 0, analyzing: 0, pending: 0, failed: 0 };
  for (const save of saves) counts[statusOf(save)]++;
  const status: SaveAnalysisStatus =
    counts.failed > 0
      ? "failed"
      : counts.ready === saves.length
        ? "ready"
        : counts.analyzing > 0
          ? "analyzing"
          : "pending";
  const label =
    saves.length === 1
      ? saveAnalysisPresentation[status].description
      : [
          counts.ready && `${counts.ready} analyzed`,
          counts.analyzing && `${counts.analyzing} analyzing`,
          counts.pending && `${counts.pending} waiting`,
          counts.failed && `${counts.failed} failed`,
        ]
          .filter(Boolean)
          .join(", ");
  return { status, label };
}

/** Extend the timeline to the latest campaign save. */
export function useTimelineCampaign(
  start: DateComponents | undefined,
  analysisStatus?: AnalysisStatus,
): TimelineCampaign | undefined {
  const nav = useCampaignTimeline();
  if (
    nav === null ||
    start === undefined ||
    !nav.saves.length ||
    (nav.saves.length < 2 && !analysisStatus)
  )
    return undefined;
  const latest = nav.saves[nav.saves.length - 1];
  return {
    end: latest.date,
    lane: (geometry) => (
      <SaveMarks nav={nav} start={start} geometry={geometry} analysisStatus={analysisStatus} />
    ),
  };
}

/** Save marks navigate between files. The playhead stays within the open save. */
function SaveMarks({
  nav,
  start,
  geometry,
  analysisStatus,
}: {
  nav: CampaignNav;
  start: DateComponents;
  geometry: SaveLaneGeometry;
  analysisStatus?: AnalysisStatus;
}) {
  const clusters = clusterSaves(nav.saves, start, geometry.px).map((cluster) => ({
    ...cluster,
    analysis: analysisStatus && summarizeAnalysis(cluster.saves, analysisStatus),
  }));
  const ribbonTop = geometry.top + 2;

  return (
    <>
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
  const analysisLabel = cluster.analysis?.label;
  const label =
    saves.length === 1
      ? saveLabel(saves[0])
      : `${saves.length} saves, ${formatLongDate(saves[0].date)} to ${formatLongDate(saves[saves.length - 1].date)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={[isOpen ? `${label}, open now` : label, analysisLabel]
            .filter(Boolean)
            .join(", ")}
          aria-current={isOpen ? "date" : undefined}
          aria-busy={opening || undefined}
          title={analysisLabel}
          data-analysis={cluster.analysis?.status}
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
            {cluster.analysis ? (
              <SaveAnalysisGlyph
                status={cluster.analysis.status}
                selected={isOpen || opening}
                opening={opening}
              />
            ) : (
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
            )}
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
        {analysisLabel && <p className="px-3 pt-3 text-xs text-game-ink-300">{analysisLabel}</p>}
        <SaveList nav={nav} saves={saves} onOpen={() => setOpen(false)} />
      </Popover.Content>
    </Popover>
  );
}
