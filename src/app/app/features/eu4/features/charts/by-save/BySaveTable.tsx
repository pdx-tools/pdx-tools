import { cx } from "class-variance-authority";
import type { BySaveFigure } from "./figures";
import { amount, otherTags, rowTag, switchYear } from "./model";
import type { BySaveRow, CountryInfo } from "./model";

const muted = "text-gray-600 dark:text-gray-300";

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 rounded-full border border-gray-400"
      style={{ background: color }}
    />
  );
}

/** The name of a row's country at a column; a tag that two countries held keeps its code. */
function rowName(
  row: BySaveRow,
  column: number,
  fallback: number,
  names: ReadonlyMap<string, CountryInfo>,
) {
  const tag = rowTag(row, column, fallback);
  return row.lineage?.kind === "ambiguous" ? tag : (names.get(tag)?.name ?? tag);
}

/**
 * Each country's value at one save, one row for each country over time.
 * The rows keep their order while the shown save follows the pointer, so
 * only names, swatches and values change in place.
 */
export function BySaveTable({
  rows,
  column,
  selected,
  dateLabel,
  figure,
  names,
}: {
  /** The rows in their order. */
  rows: readonly BySaveRow[];
  /** The column whose values show. */
  column: number;
  /** The selected column, whose name a row keeps where it has no value. */
  selected: number;
  /** The date of the shown save, for assistive technology. */
  dateLabel: string;
  figure: BySaveFigure;
  names: ReadonlyMap<string, CountryInfo>;
}) {
  return (
    <div className="max-h-72 overflow-y-auto">
      {/* A fixed width, so the values do not move as names change under the pointer. */}
      <table className="w-full max-w-md table-fixed text-sm">
        <colgroup>
          <col />
          <col className="w-20" />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">Country</th>
            <th scope="col">{dateLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tag = rowTag(row, column, selected);
            const cell = row.cells[column];
            const value = amount(cell);
            return (
              <tr key={row.key} className="border-t border-gray-200 dark:border-gray-700">
                <th scope="row" className="py-1 pr-6 text-left font-normal">
                  <span
                    className="flex flex-wrap items-center gap-x-2"
                    title={
                      row.lineage?.kind === "ambiguous"
                        ? "More than one country held this tag."
                        : undefined
                    }
                  >
                    <Swatch color={names.get(tag)?.color ?? "#808080"} />
                    {rowName(row, column, selected, names)}
                    {row.lineage?.kind === "earlierHolder" && (
                      <span className={muted}>(earlier country)</span>
                    )}
                    {otherTags(row, column, selected).map((other) => (
                      <span
                        key={`${other.tag}${other.from}`}
                        className={cx("flex items-center gap-1", muted)}
                        title={
                          other.relation === "was"
                            ? `${names.get(other.tag)?.name ?? other.tag} until ${switchYear(other.until)}`
                            : `${names.get(other.tag)?.name ?? other.tag} from ${switchYear(other.from)}`
                        }
                      >
                        {other.relation}
                        <Swatch color={names.get(other.tag)?.color ?? "#808080"} />
                        {names.get(other.tag)?.name ?? other.tag}
                      </span>
                    ))}
                  </span>
                </th>
                <td className="py-1 text-right tabular-nums">
                  {value !== null ? (
                    figure.format(value)
                  ) : cell ? (
                    <span className={muted} title="The save has no record of this country.">
                      –
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The countries with dots elsewhere that have no row at the selected save. */
export function NotAtThisSave({
  rows,
  column,
  names,
}: {
  rows: readonly BySaveRow[];
  column: number;
  names: ReadonlyMap<string, CountryInfo>;
}) {
  if (!rows.length) return null;
  return (
    <p className={cx("flex flex-wrap items-center gap-x-2 text-sm", muted)}>
      Not at this save:
      {rows.map((row) => {
        const tag = rowTag(row, column);
        return (
          <span key={row.key} className="flex items-center gap-1">
            <Swatch color={names.get(tag)?.color ?? "#808080"} />
            {rowName(row, column, column, names)}
            {row.lineage?.kind === "earlierHolder" && " (earlier country)"}
          </span>
        );
      })}
    </p>
  );
}
