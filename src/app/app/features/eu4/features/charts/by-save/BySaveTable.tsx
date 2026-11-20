import { useMemo } from "react";
import { cx } from "class-variance-authority";
import { formatLongDate } from "@/features/timeline/date";
import type { CountryValue, TagSwitch } from "@/wasm/wasm_eu4";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import type { BySaveFigure } from "./figures";
import { amount, earliestColumn, otherAmount, sortRows, sourceText } from "./model";
import type { BySaveData } from "./model";

const muted = "text-gray-600 dark:text-gray-300";

/**
 * The value of each row at the selected save, beside the value at the save
 * where the row was first seen. The table is also the legend of the chart.
 */
export function BySaveTable({
  data,
  selected,
  column,
  reason,
  figure,
  joins,
  openControl,
  steppers,
}: {
  data: BySaveData;
  selected: AnalysisSave;
  /** The column of the selected save, or null when it has no values. */
  column: number | null;
  /** Why the selected save has no values. */
  reason: string | null;
  figure: BySaveFigure;
  /** The switches that pair rows. */
  joins: readonly TagSwitch[];
  openControl: React.ReactNode;
  steppers: React.ReactNode;
}) {
  const rows = useMemo(
    () => (column === null ? data.rows : sortRows(data.rows, column, joins)),
    [data.rows, column, joins],
  );
  const { save, date } = selected;
  return (
    <section aria-label="Values at the selected save" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-live="polite" aria-atomic className="font-medium">
          {formatLongDate(date)} · {save.name} · {sourceText(save)}
          {reason && <span className={cx("block font-normal", muted)}>{reason}</span>}
        </span>
        {openControl}
        <span className="ml-auto flex gap-2">{steppers}</span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-left dark:bg-slate-900">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                Country
              </th>
              <th scope="col" colSpan={2} className="py-1 pr-3 font-medium">
                First seen
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {formatLongDate(date)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const first = earliestColumn(row);
              // The first value says nothing new when it is the selected one or a later one.
              const repeat = first !== null && column !== null && first >= column;
              return (
                <tr
                  key={row.key}
                  className="border-t border-gray-200 align-top dark:border-gray-700"
                >
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-3 shrink-0 rounded-full border border-gray-400"
                        style={{ background: row.color }}
                      />
                      {row.label}
                    </span>
                    {row.was.map((line) => (
                      <span key={line} className={cx("block pl-5 text-xs", muted)}>
                        {line}
                      </span>
                    ))}
                  </th>
                  <td className={cx("py-1 pr-3 whitespace-nowrap", repeat && muted)}>
                    {first === null ? "" : formatLongDate(data.columns[first].date)}
                  </td>
                  <td className={cx("py-1 pr-3 text-right tabular-nums", repeat && muted)}>
                    {first === null ? "" : figure.format(amount(row.values[first])!)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {column === null ? (
                      <span className={muted}>no value</span>
                    ) : (
                      <ValueCell value={row.values[column]} figure={figure} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ValueCell({ value, figure }: { value: CountryValue; figure: BySaveFigure }) {
  const own = amount(value);
  if (own !== null) return figure.format(own);
  const other = otherAmount(value);
  return (
    <span className={muted}>
      {other !== null
        ? `another country with this tag: ${figure.format(other)}`
        : value === "noProvinces"
          ? "held no provinces"
          : "no record"}
    </span>
  );
}
