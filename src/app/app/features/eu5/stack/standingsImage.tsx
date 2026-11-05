import ArrowDownTrayIcon from "@heroicons/react/16/solid/ArrowDownTrayIcon";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { chartInk, divergingPoles } from "@/components/viz/echartsTheme";
import { formatLongDate } from "@/features/timeline/date";
import { downloadData } from "@/lib/downloadData";
import { formatCompactIn } from "@/lib/format";
import type { OverviewFigure } from "../features/profiles/country/EconomyTab";
import { useEu5Players, useEu5SaveDate } from "../store";
import { useCampaignTitle } from "./HomeName";
import { rankLabel } from "./selection";
import type { Standing } from "./Standings";

const SCALE = 2;
const ROW = 38 * SCALE;
const NAME_WIDTH = 210 * SCALE;
const CELL_WIDTH = 92 * SCALE;
const PAD = 20 * SCALE;
const FONT = '"Public Sans", system-ui, sans-serif';

/** A title on as many lines as it needs */
function titleLines(ctx: CanvasRenderingContext2D, title: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of title.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The countries against the metrics of the open tab, as an image that a group can post */
async function standingsImage(
  rows: readonly Standing[],
  figures: readonly OverviewFigure[],
  title: string,
  caption: string,
  playerOf: (countryIdx: number) => string | undefined,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1200, PAD * 2 + NAME_WIDTH + figures.length * CELL_WIDTH);
  const measure = canvas.getContext("2d");
  if (!measure) throw new Error("No 2D context for the table image");
  const titleFont = `600 ${17 * SCALE}px ${FONT}`;
  measure.font = titleFont;
  const lines = titleLines(measure, title, canvas.width - PAD * 2);
  const titleHeight = lines.length * 23 * SCALE;
  canvas.height = PAD * 3 + titleHeight + 12 * SCALE + (rows.length + 1) * ROW + 20 * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context for the table image");
  ctx.fillStyle = chartInk.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = chartInk.primary;
  ctx.font = titleFont;
  lines.forEach((line, i) => ctx.fillText(line, PAD, PAD + 17 * SCALE + i * 23 * SCALE));
  const top = PAD + titleHeight + 12 * SCALE;
  // The names take the width that the metrics do not need, so a small tab has no gap.
  const cellLeft = canvas.width - PAD - figures.length * CELL_WIDTH;
  ctx.font = `500 ${11 * SCALE}px ${FONT}`;
  ctx.fillStyle = chartInk.secondary;
  ctx.textAlign = "right";
  figures.forEach((figure, i) => {
    ctx.fillText(figure.label, cellLeft + (i + 1) * CELL_WIDTH - 6 * SCALE, top + 20 * SCALE);
  });
  rows.forEach((row, r) => {
    const y = top + ROW * (r + 1);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(canvas.width - PAD, y);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = row.profile.header.colorHex;
    ctx.fillRect(PAD, y + 12 * SCALE, 11 * SCALE, 11 * SCALE);
    ctx.fillStyle = chartInk.primary;
    ctx.font = `500 ${13 * SCALE}px ${FONT}`;
    ctx.fillText(
      row.profile.header.name,
      PAD + 18 * SCALE,
      y + 16 * SCALE,
      NAME_WIDTH - 24 * SCALE,
    );
    const player = playerOf(row.countryIdx);
    if (player) {
      ctx.fillStyle = chartInk.secondary;
      ctx.font = `400 ${11 * SCALE}px ${FONT}`;
      ctx.fillText(player, PAD + 18 * SCALE, y + 31 * SCALE, NAME_WIDTH - 24 * SCALE);
    }
    ctx.textAlign = "right";
    figures.forEach((figure, i) => {
      const x = cellLeft + (i + 1) * CELL_WIDTH - 6 * SCALE;
      const overview = row.profile.overview;
      const shown = figure.shown;
      const largest = shown
        ? Math.max(0, ...rows.map((other) => Math.abs(shown(other.profile.overview))))
        : 0;
      const value = shown
        ? formatCompactIn(shown(overview), largest, figure.value(overview))
        : figure.value(overview);
      const best = Math.max(...rows.map((other) => figure.amount(other.profile.overview)));
      // Orange says below zero here too, as on the screen.
      ctx.fillStyle =
        figure.amount(overview) < 0
          ? divergingPoles.warm
          : figure.amount(overview) === best
            ? chartInk.primary
            : chartInk.secondary;
      ctx.font = `${figure.amount(overview) === best ? 600 : 400} ${12.5 * SCALE}px ${FONT}`;
      ctx.fillText(value, x, y + 16 * SCALE);
      const rank = figure.rank?.(overview);
      if (rank !== undefined) {
        ctx.fillStyle = chartInk.muted;
        ctx.font = `400 ${11 * SCALE}px ${FONT}`;
        ctx.fillText(rankLabel(rank, figure.tied?.(overview) ?? 1), x, y + 31 * SCALE);
      }
    });
  });
  ctx.textAlign = "left";
  ctx.fillStyle = chartInk.secondary;
  ctx.font = `400 ${12 * SCALE}px ${FONT}`;
  ctx.fillText(caption, PAD, canvas.height - PAD);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/png"),
  );
}

/** Save what the table shows as an image, with the table's finding as its title. */
export function StandingsImageButton({
  rows,
  figures,
  tab,
  headline,
}: {
  rows: readonly Standing[];
  figures: readonly OverviewFigure[];
  tab: string;
  headline: string | null;
}) {
  const saveDate = useEu5SaveDate();
  const players = useEu5Players();
  const name = useCampaignTitle();
  const save = async () => {
    const title = headline ?? `${tab}: ${rows.length} countries`;
    const caption = `${name}, ${formatLongDate(saveDate)}. ${tab}. Second line: rank among all countries that own land. Bold: top of the column. pdx.tools`;
    const blob = await standingsImage(rows, figures, title, caption, (idx) =>
      players.length > 1 ? players.find((p) => p.countryIdx === idx)?.name : undefined,
    );
    downloadData(blob, `${name}-standings-${tab.toLowerCase().replace(/ /g, "-")}.png`);
  };
  const saveCsv = () => {
    const cell = (text: string) => `"${text.replace(/"/g, '""')}"`;
    const head = ["Country", "Player", ...figures.map((f) => f.label)];
    const lines = rows.map((row) => [
      cell(row.profile.header.name),
      cell(players.find((p) => p.countryIdx === row.countryIdx)?.name ?? ""),
      ...figures.map((f) => String(f.amount(row.profile.overview))),
    ]);
    const csv = [head.map(cell), ...lines].map((line) => line.join(",")).join("\n");
    downloadData(new Blob([csv], { type: "text/csv" }), `${name}-standings-${slug}.csv`);
  };
  const slug = tab.toLowerCase().replace(/ /g, "-");
  const look = cx(
    "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-control px-1.5 font-game-ui text-[12px] text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100 max-md:h-11",
    focusRing,
  );
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={saveCsv}
        aria-label={`Save this table as CSV: ${tab}`}
        className={look}
      >
        CSV
      </button>
      <button
        type="button"
        onClick={() => void save()}
        aria-label={`Save an image of this table: ${tab}`}
        className={look}
      >
        <ArrowDownTrayIcon aria-hidden className="h-3.5 w-3.5" />
        Image
      </button>
    </span>
  );
}
