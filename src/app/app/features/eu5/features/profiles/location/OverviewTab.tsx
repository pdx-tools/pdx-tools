import type React from "react";
import type { LocationProfile, MapMode } from "@/wasm/wasm_eu5";
import { formatCount, formatLevel, formatMetric } from "@/lib/format";
import { formatLegendValue } from "../../../control-panel/Legend/GradientLegend";
import { Eu5Icon } from "../../../components/icons/Eu5Icon";
import { Row } from "../../../stack/parts";
import { CountryLink, MarketLink } from "../EntityLink";

interface Props {
  profile: LocationProfile;
  /**
   * Show development, population, and control. The caption has them on its
   * selected block, so it leaves them out.
   */
  headline?: boolean;
  /** The mode of the caption above. A row that repeats its answer is left out. */
  mode?: MapMode;
}

/** A value that is a name, not an amount, so it is in the sans */
function Word({ children }: { children: React.ReactNode }) {
  return <span className="font-game-ui text-[12.5px]">{children}</span>;
}

export function LocationOverviewTab({ profile, headline, mode }: Props) {
  const s = profile.stats;
  const { owner, market } = profile.header;

  return (
    <>
      {headline ? (
        <>
          <Row name="Dev" value={formatMetric(s.development)} />
          <Row name="Pop" value={formatCount(s.population)} />
          <Row name="Control" value={formatLegendValue("control", s.control)} />
        </>
      ) : null}
      {mode !== "rgoLevel" ? <Row name="RGO Level" value={formatLevel(s.rgoLevel)} /> : null}
      {mode !== "markets" ? (
        <Row name="Market Access" value={formatLegendValue("control", s.marketAccess)} />
      ) : null}
      <Row name="Tax Base" value={formatMetric(s.taxBase)} />
      {mode !== "wealth" ? <Row name="Wealth" value={formatMetric(s.wealth)} /> : null}
      <Row name="Terrain" value={<Word>{s.terrain}</Word>} />
      {s.religion && mode !== "religion" ? (
        <Row name="Religion" value={<Word>{s.religion.name}</Word>} />
      ) : null}
      {s.rawMaterial ? (
        <Row
          name="Raw Material"
          value={
            <span className="inline-flex items-center justify-end gap-1.5">
              <Eu5Icon family="goods" id={s.rawMaterial.key} size="sm" alt="" />
              <Word>{s.rawMaterial.name}</Word>
            </span>
          }
        />
      ) : null}
      {owner && mode !== "political" ? (
        <Row
          name="Owner"
          value={
            <Word>
              <CountryLink country={owner} tagLast />
            </Word>
          }
        />
      ) : null}
      {market && mode !== "markets" ? (
        <Row
          name="Market"
          value={
            <Word>
              <MarketLink market={market} />
            </Word>
          }
        />
      ) : null}
    </>
  );
}
