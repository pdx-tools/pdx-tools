import { useCallback, useMemo } from "react";
import { Button } from "@/components/Button";
import { useAnalysisQuery } from "@/features/campaign/analysis/useAnalysisQuery";
import { useAddCampaignSaves } from "@/features/campaign/useAddCampaignSaves";
import type { CampaignSaveFiles } from "@/features/campaign/useAddCampaignSaves";
import { saveSourceText } from "@/features/campaign/saveText";
import { dayNumber, formatLongDate } from "@/features/timeline/date";
import { eu4Analysis } from "@/features/eu4/analysis/analysisClient";
import { useEu4History } from "@/features/eu4/analysis/store";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { formatInt } from "@/lib/format";
import { BySaveChart } from "./BySaveChart";
import type { AxisMark, BySavePoint, BySaveSeries } from "./BySaveChart";
import { useEu4Campaign } from "./useEu4Campaign";
import type { Eu4Campaign } from "./useEu4Campaign";

const EU4_SAVES: CampaignSaveFiles = {
  pattern: /\.eu4$/i,
  accept: ".eu4",
  picker: { description: "EU4 saves", accept: { "application/pdx": [".eu4"] } },
};

const WORLD_DEVELOPMENT = { kind: "worldDevelopment" } as const;

/** Campaign history of world development, one dot for each analyzed save. */
export function CampaignHistory() {
  const campaign = useEu4Campaign();
  const { saves, enabled } = campaign;
  if (saves.length < 2 && !enabled) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>This is the only save of this campaign here.</p>
        <AddSaves />
      </div>
    );
  }
  if (!enabled) return <NotAnalyzed campaign={campaign} />;
  return <WorldDevelopment campaign={campaign} />;
}

function NotAnalyzed({ campaign }: { campaign: Eu4Campaign }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p>{countLine(campaign.saves)}</p>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={campaign.analyze}>
          Analyze campaign
        </Button>
        <span className="text-sm text-gray-600 dark:text-gray-300">
          Kept until you refresh this page.
        </span>
      </div>
      <AddSaves />
    </div>
  );
}

function countLine(saves: readonly AnalysisSave[]) {
  const first = saves[0]?.save.date;
  const last = saves.at(-1)?.save.date;
  const range = first && last ? `, ${formatLongDate(first)} to ${formatLongDate(last)}` : "";
  const files = saves.length === 1 ? "1 local file" : `${saves.length} local files`;
  return `${saves.length === 1 ? "1 save" : `${saves.length} saves`}${range}: ${files}.`;
}

function WorldDevelopment({ campaign }: { campaign: Eu4Campaign }) {
  const { saves, playthroughId } = campaign;
  const { result, error } = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    playthroughId,
    WORLD_DEVELOPMENT,
  );
  const bySnapshot = useMemo(
    () => new Map(saves.flatMap((x) => (x.snapshot ? [[x.snapshot.id, x] as const] : []))),
    [saves],
  );
  const series = useMemo((): BySaveSeries[] => {
    const points = (result?.rows ?? []).flatMap((row): BySavePoint[] => {
      const bound = bySnapshot.get(row.id);
      if (!bound || row.value === null || row.value === undefined) return [];
      return [{ snapshotId: row.id, day: dayNumber(bound.save.date), value: row.value }];
    });
    return [{ key: "world", label: "World", color: "#64748b", points }];
  }, [result, bySnapshot]);
  const describe = useCallback(
    (_series: BySaveSeries, point: BySavePoint) => {
      const bound = bySnapshot.get(point.snapshotId);
      return [
        `World development: ${formatInt(point.value)}`,
        bound ? formatLongDate(bound.save.date) : "",
        bound ? `${bound.save.name} · ${saveSourceText(bound.save)}` : "",
        bound?.snapshot ? `Patch ${bound.snapshot.gameVersion}` : "",
      ].filter(Boolean);
    },
    [bySnapshot],
  );
  const marks = useMemo(() => axisMarks(saves), [saves]);
  const range = useMemo(
    () => [saves[0].save.date, saves[saves.length - 1].save.date] as const,
    [saves],
  );
  return (
    <div className="flex flex-col gap-3">
      <StatusLine campaign={campaign} />
      {error && <p className="text-rose-700 dark:text-rose-300">{error}</p>}
      {saves.length > 0 && (
        <BySaveChart
          series={series}
          marks={marks}
          range={[range[0], range[1]]}
          axisName="Development, points"
          describe={describe}
        />
      )}
      <OpenSaveNote saves={saves} />
      <AddSaves />
    </div>
  );
}

/** Saves that have no dot get a mark on the axis at their date, with the reason. */
function axisMarks(saves: readonly AnalysisSave[]): AxisMark[] {
  return saves.flatMap((x): AxisMark[] => {
    if (x.snapshot) return [];
    const reason =
      x.status === "failed"
        ? `Could not read ${x.save.name}${x.error ? `: ${x.error}` : ""}`
        : x.status === "analyzing"
          ? `Analyzing ${x.save.name}`
          : `${x.save.name} waits for analysis`;
    return [{ key: x.save.key, day: dayNumber(x.save.date), reason }];
  });
}

function StatusLine({ campaign }: { campaign: Eu4Campaign }) {
  const { saves, progress, paused, issues } = campaign;
  const done = saves.filter((x) => x.snapshot).length;
  const failed = saves.filter((x) => x.status === "failed");
  return (
    <div role="status" className="flex flex-col gap-1 text-sm">
      {progress ? (
        <p className="flex items-center gap-3">
          <span>
            {progress.completed} of {progress.total} · reading
          </span>
          <Button onClick={campaign.stop}>Stop</Button>
        </p>
      ) : paused ? (
        <p className="flex items-center gap-3">
          <span>
            {done} of {saves.length} saves analyzed.
          </span>
          <Button onClick={campaign.analyze}>Resume</Button>
        </p>
      ) : null}
      {failed.map((x) => (
        <p key={x.save.key}>Could not read {x.save.name}.</p>
      ))}
      {issues.length > 0 && failed.length === 0 && !progress && (
        <details>
          <summary className="cursor-pointer">{issues.length} analysis notices</summary>
          <ul className="mt-1 list-disc pl-5">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function OpenSaveNote({ saves }: { saves: readonly AnalysisSave[] }) {
  const open = saves.find((x) => x.save.isOpen);
  if (open?.snapshot) return null;
  return (
    <p className="text-sm text-gray-600 dark:text-gray-300">The open save is not on this chart.</p>
  );
}

function AddSaves() {
  const { busy, chooseFiles, fileInput } = useAddCampaignSaves(EU4_SAVES, (issue) =>
    useEu4History.setState({ issues: [issue] }),
  );
  return (
    <>
      <Button disabled={busy} onClick={() => void chooseFiles()}>
        Add saves
      </Button>
      <input {...fileInput} aria-label="Add campaign saves" className="sr-only" />
    </>
  );
}
