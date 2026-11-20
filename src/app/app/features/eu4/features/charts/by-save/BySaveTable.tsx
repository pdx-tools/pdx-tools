import { useMemo } from "react";
import { formatLongDate } from "@/features/timeline/date";
import type { ChartCountries } from "@/wasm/wasm_eu4";
import { saveSourceText } from "@/features/campaign/saveText";
import type { BySaveFigure } from "./figures";
import { earliestColumn, sortRows } from "./model";
import type { BySaveData } from "./model";

/** The value of each row at one save, beside its value at the row's earliest save. */
export function BySaveTable({
  data,
  column,
  figure,
  chart,
  header,
}: {
  data: BySaveData;
  column: number;
  figure: BySaveFigure;
  chart: ChartCountries | null;
  /** Actions for the save of the column. */
  header?: React.ReactNode;
}) {
  const save = data.columns[column].save;
  const rows = useMemo(() => sortRows(data.rows, column, chart), [data.rows, column, chart]);
  return (
    <section
      aria-live="polite"
      aria-label="Values at the selected save"
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">
          {formatLongDate(save.date)} · {save.name} · {saveSourceText(save)}
        </span>
        {header}
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-left dark:bg-slate-900">
            <tr>
              <th className="py-1 pr-3 font-medium">Country</th>
              <th className="py-1 pr-3 font-medium">Earliest save</th>
              <th className="py-1 pr-3 text-right font-medium" />
              <th className="py-1 text-right font-medium">{formatLongDate(save.date)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const earliest = earliestColumn(row);
              const value = row.values[column];
              return (
                <tr
                  key={row.key}
                  className="border-t border-gray-200 align-top dark:border-gray-700"
                >
                  <td className="py-1 pr-3">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-3 shrink-0 rounded-full border border-gray-400"
                        style={{ background: row.color }}
                      />
                      {row.label}
                    </span>
                    {row.was.map((line) => (
                      <span
                        key={line}
                        className="block pl-5 text-xs text-gray-600 dark:text-gray-300"
                      >
                        {line}
                      </span>
                    ))}
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {earliest === null ? "" : formatLongDate(data.columns[earliest].save.date)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {earliest === null ? "" : figure.format(row.values[earliest]!)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {value === null ? (
                      <span className="text-gray-600 dark:text-gray-300">held no provinces</span>
                    ) : (
                      figure.format(value)
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
