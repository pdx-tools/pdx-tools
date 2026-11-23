import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as echarts from "echarts/core";
import { Alert } from "@/components/Alert";
import { EChart, escapeEChartsHtml } from "@/components/viz/EChart";
import type { EChartsOption } from "@/components/viz/EChart";
import { useAnalysisQuery } from "@/features/campaign/analysis/useAnalysisQuery";
import type { SnapshotSelection } from "@/features/campaign/analysis/session";
import { eu4Analysis } from "@/features/eu4/analysis/analysisClient";
import { useEu4History } from "@/features/eu4/analysis/store";
import { useCampaignSheet } from "@/features/eu4/store";
import {
  DAYS_PER_YEAR,
  dateFromDayNumber,
  dayNumber,
  formatLongDate,
} from "@/features/timeline/date";
import { formatInt } from "@/lib/format";
import { isDarkMode } from "@/lib/dark";
import type { CountryTag } from "@/wasm/wasm_eu4";
import type { CampaignFigure } from "./figures";
import { HistoryHeader } from "./HistoryHeader";
import { palettes, sessionBand } from "./historyOption";
import {
  MANA_USES,
  baselineOf,
  chosenTypes,
  percent,
  shares,
  signed,
  emptyText,
  manaReading,
  notCarried,
  notCarriedText,
  typesText,
  manaUseColors,
  sinceHead,
  useFullName,
  useName,
  yearsText,
} from "./mana";
import { ManaViewRow } from "./ManaControls";
import { alignColumns, lineageKey, sourceText, unclearTags } from "./model";
import type { CountryInfo } from "./model";
import { nameOf } from "./useHistoryModel";
import type { Eu4Campaign } from "./useEu4Campaign";
import { useWatchStart } from "./useWatchStart";
import { useOpenSlot } from "./useOpenSlot";
import { selectSave, useCampaignView, useFocus } from "./view";

/** One country's spend by use at each read save. */
type UseLine = {
  key: string;
  name: string;
  played: boolean;
  /** Per column: the spend by use, or null where the save does not carry the country. */
  values: (number[] | null)[];
};

/**
 * By use: where one country's mana went. Its spend since 1444, stacked by
 * use, with a table that gives each use its figures.
 */
export function ManaUseView({
  campaign,
  figure,
  tags,
  selection,
  names,
  chartRow,
  foot,
}: {
  campaign: Eu4Campaign;
  figure: CampaignFigure;
  /** The chart's countries, or null while they load. */
  tags: readonly CountryTag[] | null;
  selection: SnapshotSelection;
  names: ReadonlyMap<string, CountryInfo>;
  chartRow: React.ReactNode;
  /** The sheet's foot, with a note on the countries that have no mana figures. */
  foot: (
    notCarried: { text: string; count: number } | null,
    unclear: readonly string[],
  ) => React.ReactNode;
}) {
  const { playthroughId } = campaign;
  const view = useCampaignSheet().mana;
  const query = useMemo(
    () => (tags ? { kind: "manaUses" as const, tags: [...tags], types: chosenTypes(view) } : null),
    [tags, view],
  );
  const {
    result,
    snapshotIds,
    error,
    loading: queryLoading,
  } = useAnalysisQuery(eu4Analysis, useEu4History, playthroughId, query, selection);
  const { columns, lines, missing, unclear, spentNothing } = useMemo(() => {
    const { columns, at } = alignColumns(snapshotIds, campaign.saves);
    const lines: UseLine[] = (result ?? []).flatMap((x) => {
      const values = at.map((i) => x.values[i] ?? null);
      if (!values.some((uses) => uses && uses.some((v) => v > 0))) return [];
      const held = x.lineage.tags;
      return [
        {
          key: lineageKey(x.lineage),
          name: nameOf(names, held[held.length - 1].tag),
          played: x.played,
          values,
        },
      ];
    });
    // The chart's countries that no save carries mana for.
    const missing = notCarried(result, tags);
    // A tag whose holders cannot be told apart has no values, so it is named apart.
    const unclear = unclearTags(result ?? []);
    // Carried, with nothing spent on the types.
    const spentNothing = !!result?.length && !lines.length && !unclear.length;
    return { columns, lines, missing, unclear, spentNothing };
  }, [result, snapshotIds, campaign.saves, names, tags]);

  // The subject: the one chosen here, else the followed country, else a played one.
  const focus = useFocus(playthroughId);
  const [chosen, setChosen] = useState<string | null>(null);
  const followed = lines.find((x) => x.key === focus.subject) ?? null;
  const subject =
    lines.find((x) => x.key === chosen) ??
    followed ??
    lines.find((x) => x.played) ??
    lines[0] ??
    null;
  // The followed country has no mana figures, so another is shown: say so.
  const followedTag =
    missing.find((tag) => lineageKey({ tags: [{ tag }] }) === focus.subject) ?? null;
  const missingFollowed = !chosen && !followed && followedTag ? nameOf(names, followedTag) : null;
  const notes = missing.length
    ? {
        text: notCarriedText(missing.map((tag) => nameOf(names, tag))),
        count: missing.length,
      }
    : null;

  const selectedKey = useCampaignView((state) =>
    state.selected?.campaignId === playthroughId ? state.selected.saveKey : null,
  );
  const found = columns.findIndex((x) => x.save.key === selectedKey);
  const selected = found >= 0 ? found : columns.length - 1;
  const watchStart = useWatchStart(columns);
  const days = useMemo(() => columns.map((x) => dayNumber(x.date)), [columns]);
  const select = useCallback(
    (column: number) => {
      const save = columns[column];
      if (save && playthroughId) selectSave(playthroughId, save.save.key);
    },
    [columns, playthroughId],
  );
  const selectedSave = columns[selected];
  const { openSlot, changed } = useOpenSlot(campaign, selectedSave);

  const viewRow = (
    <ManaViewRow
      option="use"
      subject={{
        options: lines.map((x) => ({ key: x.key, name: x.name })),
        value: subject?.key ?? null,
        onChange: setChosen,
      }}
    />
  );
  const empty = emptyText({
    reading: manaReading({
      countriesLoading: tags === null,
      queryLoading,
      campaignReading: !!campaign.progress,
      hasResult: !!result,
    }),
    failed: !!error,
    hasResult: !!result,
    allSpentNothing: spentNothing,
    view: { ...view, use: "all" },
  });
  if (!subject || selected < 0 || !columns.length) {
    return (
      <div className="flex flex-col gap-3">
        {chartRow}
        {viewRow}
        <Alert.Error msg={error} />
        {empty && <p className="text-sm text-gray-700 dark:text-gray-200">{empty}</p>}
        {foot(notes, unclear)}
      </div>
    );
  }
  const baseline = baselineOf(selected, watchStart);
  const now = subject.values[selected];
  const before = baseline ? subject.values[baseline.column] : null;
  const since = now && before ? now.map((x, i) => x - before[i]) : null;
  const total = now ? now.reduce((a, b) => a + b, 0) : null;
  const sinceTotal = since ? since.reduce((a, b) => a + b, 0) : null;
  const b = (text: string) => <strong className="font-semibold">{text}</strong>;
  // Only why another country is shown, or why none is: the table and chart say the rest.
  const instead = missingFollowed && (
    <>
      No mana figures for {b(missingFollowed)}; showing {subject.name}.{" "}
    </>
  );
  const said = !now && <>No mana figures for {b(subject.name)} in this save.</>;
  const sentence = (instead || said) && (
    <>
      {instead}
      {said}
    </>
  );
  // The use colors for the sheet's theme.
  const colors = manaUseColors(isDarkMode());
  const dateText = (column: number) => formatLongDate(columns[column].date);
  // The since column names its baseline.
  const sinceText = baseline ? sinceHead(columns, baseline, watchStart) : null;
  const parts = now ? shares(now) : [];

  return (
    <div className="flex flex-col gap-3">
      {chartRow}
      {viewRow}
      <Alert.Error msg={error} />
      {changed}
      <div
        role="group"
        tabIndex={0}
        aria-label="Mana by use. Left and right arrows select an earlier or a later save; Home and End the first and the last."
        className="flex flex-col gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
        onKeyDown={(event) => {
          const key = event.key;
          if (key === "ArrowLeft" || key === "ArrowRight")
            select(
              Math.min(columns.length - 1, Math.max(0, selected + (key === "ArrowLeft" ? -1 : 1))),
            );
          else if (key === "Home" || key === "End") select(key === "Home" ? 0 : columns.length - 1);
          else return;
          event.preventDefault();
        }}
      >
        <HistoryHeader
          date={selectedSave.date}
          title={`${selectedSave.save.name} · ${sourceText(selectedSave.save)}`}
          earlier={selected > 0 ? dateText(selected - 1) : null}
          later={selected < columns.length - 1 ? dateText(selected + 1) : null}
          onStep={(by) => select(selected + by)}
          sentence={sentence}
          openSlot={openSlot}
        />
        <div className="flex flex-wrap gap-4">
          <UseChart
            line={subject}
            days={days}
            selected={selected}
            session={watchStart >= 0 ? days[watchStart] : null}
            label={`${figure.title}, ${subject.name}, ${formatLongDate(selectedSave.date)}`}
            onSelect={select}
          />
          <table className="min-w-64 grow self-start text-sm tabular-nums">
            <caption className="sr-only">
              {subject.name}, {typesText(view)} by use, {formatLongDate(selectedSave.date)}
            </caption>
            <thead>
              <tr className="text-xs text-gray-600 dark:text-gray-300">
                <th className="text-left font-normal">
                  {typesText(view)[0].toUpperCase() + typesText(view).slice(1)}
                </th>
                <th className="text-right font-normal">spent</th>
                <th className="text-right font-normal">share</th>
                {since && <th className="text-right font-normal whitespace-nowrap">{sinceText}</th>}
              </tr>
            </thead>
            <tbody>
              {[...MANA_USES].reverse().map((use) => {
                const i = MANA_USES.indexOf(use);
                return (
                  <tr key={use} title={useFullName[use]}>
                    <td className="py-0.5">
                      <span
                        aria-hidden
                        className="mr-2 inline-block size-2.5 rounded-sm"
                        style={{ background: colors[use] }}
                      />
                      {useName[use]}
                    </td>
                    <td className="text-right">{now ? formatInt(now[i]) : ""}</td>
                    <td className="text-right">{now ? percent(parts[i]) : ""}</td>
                    {since && <td className="text-right">{signed(since[i])}</td>}
                  </tr>
                );
              })}
              <tr className="border-t border-solid border-gray-300 font-semibold dark:border-gray-600">
                <td className="py-0.5">Total</td>
                <td className="text-right">{total === null ? "" : formatInt(total)}</td>
                <td />
                {since && sinceTotal !== null && (
                  <td className="text-right">{signed(sinceTotal)}</td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {foot(notes, unclear)}
    </div>
  );
}

/** The subject's spend since 1444 stacked by use, a dot per save on its total. */
const GRID = { left: 52, right: 12, top: 12, bottom: 28 };

function UseChart({
  line,
  days,
  selected,
  session,
  label,
  onSelect,
}: {
  line: UseLine;
  days: readonly number[];
  selected: number;
  /** The day the watched session began, shaded to the last save. */
  session: number | null;
  label: string;
  onSelect: (column: number) => void;
}) {
  const dark = isDarkMode();
  const palette = palettes[dark ? "dark" : "light"];
  const option = useMemo((): EChartsOption => {
    const points = days.flatMap((day, i) => (line.values[i] ? [{ day, i }] : []));
    // The plot is some 320 px wide.
    const band =
      session === null
        ? null
        : sessionBand(session, days[days.length - 1], palette, {
            perPixel: Math.max(1, days[days.length - 1] - days[0]) / 320,
            left: days[0],
          });
    const year = (day: number) => String(dateFromDayNumber(day).year);
    const tooltip = (column: number) => {
      const now = line.values[column];
      if (!now) return "";
      const previous = points.filter((x) => x.i < column).at(-1);
      const before = previous ? line.values[previous.i] : null;
      const span = previous ? days[column] - previous.day : 0;
      const rows = MANA_USES.map((use, k) => {
        const added = before ? ` (${signed(now[k] - before[k])})` : "";
        return `${escapeEChartsHtml(useFullName[use])}: ${formatInt(now[k])}${added}`;
      });
      const total = now.reduce((a, b) => a + b, 0);
      const added = before ? total - before.reduce((a, b) => a + b, 0) : 0;
      const rate =
        before && span > 0
          ? `<br/>${signed(added)} in ${yearsText(span)}, about ${formatInt((added / span) * DAYS_PER_YEAR)} a year`
          : "";
      return `<b>${escapeEChartsHtml(formatLongDate(dateFromDayNumber(days[column])))}</b><br/>${rows.join("<br/>")}${rate}`;
    };
    return {
      animation: false,
      grid: GRID,
      tooltip: {
        trigger: "axis",
        // Kept inside the plot, and narrow enough to wrap on the narrow sheet.
        confine: true,
        extraCssText: "max-width: 240px; white-space: normal;",
        position: (point, _params, _dom, _rect, size) => {
          const [w, h] = size.contentSize;
          const [viewW, viewH] = size.viewSize;
          const right = viewW - GRID.right - w;
          const x = point[0] + 12 <= right ? point[0] + 12 : point[0] - 12 - w;
          const y = Math.min(point[1] + 12, viewH - GRID.bottom - h);
          return [Math.max(GRID.left, Math.min(x, right)), Math.max(GRID.top, y)];
        },
        formatter: (params: unknown) => {
          const first = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number };
          const column = first?.dataIndex ?? -1;
          return column >= 0 ? tooltip(column) : "";
        },
      },
      xAxis: {
        type: "value",
        min: days[0],
        max: days[days.length - 1],
        axisLabel: { formatter: year, color: palette.faint, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: { formatter: (value: number) => formatInt(value), color: palette.faint },
        splitLine: { lineStyle: { color: palette.grid } },
      },
      series: [
        ...MANA_USES.map((use, k) => ({
          type: "line" as const,
          name: useFullName[use],
          stack: "uses",
          symbol: "none",
          // A save that does not carry the country breaks the bands there.
          connectNulls: false,
          // A thin edge in the ground color keeps neighboring bands apart.
          lineStyle: { width: 2, color: palette.ground },
          areaStyle: { color: manaUseColors(dark)[use], opacity: 0.9 },
          emphasis: { disabled: true },
          data: days.map((day, i) => [day, line.values[i]?.[k] ?? null]),
          ...(k === 0 && {
            markLine: {
              silent: true,
              symbol: ["none", "none"],
              label: { show: false },
              lineStyle: { color: palette.ink, width: 1, type: "solid" as const },
              data: [{ xAxis: days[selected] }, ...(band ? [band.edge] : [])],
            },
            ...(band && { markArea: band.markArea }),
          }),
        })),
        {
          type: "scatter" as const,
          name: "All uses",
          symbolSize: 5,
          itemStyle: { color: palette.ink },
          data: days.map((day, i) => {
            const uses = line.values[i];
            return [day, uses ? uses.reduce((a, b) => a + b, 0) : null];
          }),
        },
      ],
    };
  }, [line, days, selected, session, palette, dark]);
  // The chart lives across renders, so a click reads the latest saves.
  const latest = useRef({ days, line, onSelect });
  useLayoutEffect(() => {
    latest.current = { days, line, onSelect };
  });
  const onInit = useCallback((chart: echarts.ECharts) => {
    const zr = chart.getZr();
    const click = (event: { offsetX: number; offsetY: number }) => {
      const { days, line, onSelect } = latest.current;
      const [day] = chart.convertFromPixel({ xAxisIndex: 0 }, [event.offsetX, event.offsetY]);
      let best = -1;
      days.forEach((x, i) => {
        if (line.values[i] && (best < 0 || Math.abs(x - day) < Math.abs(days[best] - day)))
          best = i;
      });
      if (best >= 0) onSelect(best);
    };
    zr.on("click", click);
    return () => zr.off("click", click);
  }, []);
  return (
    <div role="img" aria-label={label} className="min-w-80 grow basis-80">
      <EChart option={option} onInit={onInit} style={{ height: 400, width: "100%" }} />
    </div>
  );
}
