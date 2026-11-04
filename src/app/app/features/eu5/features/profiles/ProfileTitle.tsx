import { cx } from "class-variance-authority";
import type { EntityHeader } from "@/wasm/wasm_eu5";
import { formatCount, formatExact, formatMetric } from "@/lib/format";
import { Eu5Flag } from "../../components/flags/Eu5Flag";
import { ExactValue, Stat, Swatch } from "../../stack/parts";
import { displayTag } from "../../stack/selection";
import { useEu5SelectionState } from "../../store";

/**
 * The identity of a profile level. A country gets its coat of arms at its native
 * atlas size (72px); a market has no flag, so it keeps a color plate. Beside it
 * is the name at heading size, the tag, and the headline figures on one line. The
 * selection strip names the selected entity, so its name is only for a screen reader.
 */
export function EntityProfileTitle({ header }: { header: EntityHeader }) {
  const tag = displayTag(header.tag);
  const selected = useEu5SelectionState()?.activeProfile;
  const named =
    (selected?.kind === "country" && selected.country.name === header.name) ||
    (selected?.kind === "market" && selected.market.name === header.name);
  return (
    <div className="flex items-center gap-3 border-b border-game-line px-3.5 py-3.5">
      {header.tag ? (
        <Eu5Flag
          flag={header.flag}
          colorHex={header.colorHex}
          size={named ? "lg" : "xl"}
          alt={`${header.name} flag`}
          className="shrink-0 rounded-[2px] border border-game-rim"
        />
      ) : (
        <Swatch color={header.colorHex} size={16} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className={cx("flex min-w-0 flex-wrap items-baseline gap-x-2", named && "sr-only")}>
          <h2 className="text-[17px] leading-tight font-medium text-game-ink-100">{header.name}</h2>
          {tag ? (
            <span className="shrink-0 font-game-ui text-[12px] text-game-ink-500">{tag}</span>
          ) : null}
        </div>
        <HeadlineStats header={header} />
      </div>
    </div>
  );
}

/** The full values of the headline figures, for a tooltip */
export function headlineExact(header: EntityHeader): string {
  const { locationCount, totalDevelopment, totalPopulation } = header.headline;
  return `${formatExact(locationCount)} locations · ${formatExact(totalDevelopment)} Dev · ${formatExact(totalPopulation)} Pop`;
}

/**
 * The headline figures of a country or market on one line. Each view gives
 * them in one form, so one line stays one line at 340px. By default the line
 * itself has the tooltip with the full values. A parent that is a button has
 * that tooltip instead, because a control must not hold a second one.
 */
export function HeadlineStats({ header, exact = true }: { header: EntityHeader; exact?: boolean }) {
  const { locationCount, totalDevelopment, totalPopulation } = header.headline;
  const line = "flex w-fit flex-wrap items-baseline gap-x-2.5";
  const figures = (
    <>
      <Stat label="locations" value={formatCount(locationCount)} />
      <Stat label="Dev" value={formatMetric(totalDevelopment)} />
      <Stat label="Pop" value={formatCount(totalPopulation)} />
    </>
  );
  return exact ? (
    <ExactValue exact={headlineExact(header)} className={line}>
      {figures}
    </ExactValue>
  ) : (
    <span className={line}>{figures}</span>
  );
}
