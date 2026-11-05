/** The parts of the story image: one picture with the map, the sentence and the lead chart */
export type StoryParts = {
  map: Blob;
  title: string;
  subtitle: string;
  keyLine?: string;
  rows: { name: string; color: string; shown: string }[];
  rowsTitle: string;
  chart?: {
    title: string;
    /** A year to mark on the chart, such as the date of a past map */
    markYear?: number;
    /** Dated notes beside the marks of the chart */
    notes?: { x: number; text: string }[];
    /** How the y axis writes a value */
    formatY?: (value: number) => string;
    series: {
      name: string;
      color: string;
      points: readonly (readonly [number, number])[];
      /** The last value as the tables write it */
      end: string;
    }[];
  };
};

const PANEL_WIDTH = 760;
const WIDTH = 2400;
const PAD = 36;
const FONT = '"Public Sans", system-ui, sans-serif';
const SURFACE = "#0e1217";
const PRIMARY = "#f2eade";
const SECONDARY = "#c5c0b8";
const FAINT = "rgba(255,255,255,0.14)";

/** Text on as many lines as it needs */
export function wrapWords(
  measure: (text: string) => number,
  text: string,
  width: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  chart: NonNullable<StoryParts["chart"]>,
  box: { x: number; y: number; width: number; height: number },
) {
  const all = chart.series.flatMap((s) => s.points);
  if (all.length < 2) return;
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const y1 = Math.max(...ys, 1);
  const px = (x: number) => box.x + ((x - x0) / Math.max(1e-6, x1 - x0)) * box.width;
  const py = (y: number) => box.y + box.height - (Math.max(0, y) / y1) * box.height;
  ctx.font = `400 22px ${FONT}`;
  // The y axis: a rule and a value at zero, the middle, and the top.
  for (const share of [0, 0.5, 1]) {
    const at = box.y + box.height - share * box.height;
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(box.x, at);
    ctx.lineTo(box.x + box.width, at);
    ctx.stroke();
    ctx.fillStyle = SECONDARY;
    ctx.textAlign = "left";
    ctx.fillText((chart.formatY ?? String)(y1 * share), box.x, at - 6);
  }
  ctx.textAlign = "left";
  for (const note of chart.notes ?? []) {
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px(note.x), box.y);
    ctx.lineTo(px(note.x), box.y + box.height);
    ctx.stroke();
  }
  if (chart.markYear !== undefined) {
    ctx.strokeStyle = PRIMARY;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px(chart.markYear), box.y);
    ctx.lineTo(px(chart.markYear), box.y + box.height);
    ctx.stroke();
    ctx.fillStyle = PRIMARY;
    ctx.font = `600 22px ${FONT}`;
    ctx.textAlign = px(chart.markYear) > box.x + box.width / 2 ? "right" : "left";
    ctx.fillText(
      String(chart.markYear),
      px(chart.markYear) + (ctx.textAlign === "right" ? -8 : 8),
      box.y + 22,
    );
    ctx.textAlign = "left";
    ctx.font = `400 22px ${FONT}`;
  }
  for (const series of chart.series) {
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    series.points.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    ctx.stroke();
  }
  ctx.font = `400 22px ${FONT}`;
  ctx.fillStyle = SECONDARY;
  ctx.textAlign = "left";
  ctx.fillText(String(Math.floor(x0)), box.x, box.y + box.height + 28);
  ctx.textAlign = "right";
  ctx.fillText(String(Math.floor(x1)), box.x + box.width, box.y + box.height + 28);
  ctx.textAlign = "left";
  // Names under the chart, each with its line's colour.
  let at = box.x;
  const y = box.y + box.height + 62;
  for (const series of chart.series) {
    ctx.fillStyle = series.color;
    ctx.fillRect(at, y - 16, 18, 18);
    ctx.fillStyle = PRIMARY;
    const text = `${series.name} ${series.end}`;
    ctx.fillText(text, at + 26, y);
    at += ctx.measureText(text).width + 60;
  }
}

/** One image of the map, the sentence, the top rows and the lead chart */
export async function composeStory(parts: StoryParts): Promise<Blob> {
  const map = await createImageBitmap(parts.map);
  const mapWidth = WIDTH - PANEL_WIDTH;
  const mapHeight = Math.round((map.height / map.width) * mapWidth);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = Math.max(mapHeight, 1300);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context for the story image");
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(map, 0, (canvas.height - mapHeight) / 2, mapWidth, mapHeight);
  map.close();

  const x = mapWidth + PAD;
  const width = PANEL_WIDTH - PAD * 2;
  let y = PAD + 8;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PRIMARY;
  ctx.font = `600 44px ${FONT}`;
  for (const line of wrapWords((t) => ctx.measureText(t).width, parts.title, width)) {
    y += 52;
    ctx.fillText(line, x, y);
  }
  y += 42;
  ctx.font = `400 26px ${FONT}`;
  ctx.fillStyle = SECONDARY;
  ctx.fillText(`${parts.subtitle} \u00b7 pdx.tools`, x, y, width);
  if (parts.keyLine) {
    for (const line of wrapWords((t) => ctx.measureText(t).width, parts.keyLine, width)) {
      y += 34;
      ctx.fillText(line, x, y);
    }
  }
  y += 56;
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText(parts.rowsTitle, x, y);
  y += 14;
  for (const row of parts.rows) {
    y += 42;
    ctx.fillStyle = FAINT;
    ctx.fillRect(x, y + 12, width, 2);
    if (row.color) {
      ctx.fillStyle = row.color;
      ctx.fillRect(x, y - 20, 22, 22);
    }
    ctx.fillStyle = PRIMARY;
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(row.name, x + (row.color ? 34 : 0), y, width - 170);
    ctx.textAlign = "right";
    ctx.fillText(row.shown, x + width, y);
    ctx.textAlign = "left";
  }
  if (parts.chart) {
    y += 70;
    ctx.fillStyle = SECONDARY;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(parts.chart.title, x, y, width);
    const bottom = canvas.height - PAD - 70;
    if (bottom - y > 160) {
      // Room for the top value of the y axis under the chart's title.
      drawChart(ctx, parts.chart, { x, y: y + 44, width, height: bottom - y - 44 });
    }
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/png"),
  );
}
