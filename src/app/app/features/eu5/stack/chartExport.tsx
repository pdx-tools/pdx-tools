import { useCallback, useRef } from "react";
import ArrowDownTrayIcon from "@heroicons/react/16/solid/ArrowDownTrayIcon";
import type * as echarts from "echarts/core";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { chartInk } from "@/components/viz/echartsTheme";
import { formatLongDate } from "@/features/timeline/date";
import { downloadData } from "@/lib/downloadData";
import { useEu5SaveDate } from "../store";
import { useCampaignTitle } from "./HomeName";

const SCALE = 2;
const PADDING = 20 * SCALE;
const TITLE_SIZE = 16 * SCALE;
const CAPTION_SIZE = 12 * SCALE;

/** Draw a chart with its title and a caption, so that the image explains itself off the site */
async function captionedChart(chart: echarts.ECharts, title: string, caption: string) {
  const url = chart.getDataURL({
    type: "png",
    pixelRatio: SCALE,
    backgroundColor: chartInk.surface,
  });
  const image = new Image();
  image.src = url;
  await image.decode();
  const top = PADDING + TITLE_SIZE + PADDING / 2;
  const canvas = document.createElement("canvas");
  canvas.width = image.width + PADDING * 2;
  canvas.height = top + image.height + CAPTION_SIZE + PADDING * 1.5;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context for the chart image");
  ctx.fillStyle = chartInk.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = chartInk.primary;
  ctx.font = `500 ${TITLE_SIZE}px "Public Sans", system-ui, sans-serif`;
  ctx.fillText(title, PADDING, PADDING + TITLE_SIZE * 0.8);
  ctx.drawImage(image, PADDING, top);
  ctx.fillStyle = chartInk.secondary;
  ctx.font = `400 ${CAPTION_SIZE}px "Public Sans", system-ui, sans-serif`;
  ctx.fillText(caption, PADDING, canvas.height - PADDING / 2);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No chart image"))),
      "image/png",
    ),
  );
}

/**
 * Saving one chart as an image, with its title, the campaign and the save date on it.
 * `track` goes to the chart's `onInit`, and `button` goes beside its title.
 */
export function useChartExport(title: string) {
  const chart = useRef<echarts.ECharts | null>(null);
  const saveDate = useEu5SaveDate();
  const track = useCallback((instance: echarts.ECharts) => {
    chart.current = instance;
  }, []);
  const name = useCampaignTitle();
  const save = async () => {
    if (!chart.current) return;
    const caption = `${name}, saved ${formatLongDate(saveDate)} · pdx.tools`;
    const blob = await captionedChart(chart.current, title, caption);
    downloadData(blob, `${name}-${title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.png`);
  };
  const button = (
    <button
      type="button"
      onClick={() => void save()}
      aria-label={`Save an image of ${title}`}
      className={cx(
        "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-control px-1.5 font-game-ui text-[12px] text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100 max-md:h-11",
        focusRing,
      )}
    >
      <ArrowDownTrayIcon aria-hidden className="h-3.5 w-3.5" />
      Image
    </button>
  );
  return { track, button };
}
