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

const MARK_WIDTH = 14;

export type SaveAnalysisStatus = "ready" | "analyzing" | "pending";
type Cluster = {
  x: number;
  saves: readonly CampaignSave[];
  analyzed?: number;
  analysisStatus?: SaveAnalysisStatus;
  analysisLabel?: string;
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

/** Extend the timeline to the latest campaign save. */
export function useTimelineCampaign(
  start: DateComponents | undefined,
  analysisStatus?: AnalysisStatus,
): TimelineCampaign | undefined {
  const nav = useCampaign();
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
  const clusters: Cluster[] = clusterSaves(nav.saves, start, geometry.px).map((cluster) => {
    if (!analysisStatus) return cluster;
    const statuses = cluster.saves.map(analysisStatus);
    const analyzed = statuses.filter((status) => status === "ready").length;
    const analyzing = statuses.filter((status) => status === "analyzing").length;
    const waiting = statuses.length - analyzed - analyzing;
    const status = analyzed === statuses.length ? "ready" : analyzing > 0 ? "analyzing" : "pending";
    return {
      ...cluster,
      analyzed,
      analysisStatus: status,
      analysisLabel:
        statuses.length === 1
          ? status === "ready"
            ? "Analysis ready"
            : status === "analyzing"
              ? "Analyzing save"
              : "Waiting for analysis"
          : [
              analyzed && `${analyzed} analyzed`,
              analyzing && `${analyzing} analyzing`,
              waiting && `${waiting} waiting`,
            ]
              .filter(Boolean)
              .join(", "),
    };
  });
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
              cluster.analyzed === cluster.saves.length
                ? "stroke-emerald-400/60"
                : cluster.saves.some((x) => x.isOpen)
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
  const { analysisLabel } = cluster;
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
          aria-busy={opening || undefined}
          title={analysisLabel}
          data-analysis={cluster.analysisStatus}
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
                  cluster.analyzed != null
                    ? cluster.analyzed > 0
                      ? "fill-emerald-600"
                      : "fill-game-ink-700"
                    : isOpen
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
                cluster.analyzed != null
                  ? cluster.analyzed === saves.length
                    ? "fill-emerald-400 stroke-emerald-300"
                    : cluster.analysisStatus === "analyzing"
                      ? "fill-amber-400 stroke-amber-300"
                      : "fill-game-ink-700 stroke-game-ink-500 group-hover:stroke-game-ink-100"
                  : isOpen || opening
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
        {analysisLabel && <p className="px-3 pt-3 text-xs text-game-ink-300">{analysisLabel}</p>}
        <SaveList nav={nav} saves={saves} onOpen={() => setOpen(false)} />
      </Popover.Content>
    </Popover>
  );
}
