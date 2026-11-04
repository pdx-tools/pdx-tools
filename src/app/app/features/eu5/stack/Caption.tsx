import type React from "react";
import { formatExact, formatMetric, formatPercent } from "@/lib/format";
import type {
  CountryProfile,
  DiplomacySubjectType,
  LocationProfile,
  MapMode,
} from "@/wasm/wasm_eu5";
import {
  useEu5MapMode,
  useEu5MapModeGradient,
  useEu5PaletteGradients,
  useEu5Players,
  useEu5SelectionState,
} from "../store";
import { EntityName } from "../components/EntityName";
import { Eu5Icon } from "../components/icons/Eu5Icon";
import { legendPosition, rampColor } from "../control-panel/Legend/GradientLegend";
import { CountryLink, MarketLink } from "../features/profiles/EntityLink";
import { LocationParts } from "../features/profiles/location/LocationProfile";
import { useEu5SelectionTrigger } from "../features/profiles/useEu5Trigger";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { ProfileSkeleton } from "../features/profiles/ProfileSkeleton";
import {
  GOODS_SHOWN,
  goodsByImbalance,
  signedImbalance,
} from "../features/profiles/market/GoodsTab";
import { ModeRanking, RankList, RankRow, byDesc, countryRow } from "./ModeRanking";
import type { Ranked } from "./ModeRanking";
import { isCountryMode, locationRowValue, useCountryProfile } from "./compare";
import { Band, DivergingBar, Swatch } from "./parts";
import { SetLeaders } from "./SetLeaders";
import { SelectedFigures } from "./SelectedEntity";
import { captionHeading, isCountrySet, possessive } from "./selection";

/**
 * The root of the column is always the map's caption. A selection narrows
 * the caption in place: the selected entity heads it, and its rows are the
 * selection's part of what the mode colours.
 */
export function Caption() {
  const selection = useEu5SelectionState();
  const profile =
    selection && !selection.isEmpty && selection.preset !== "players"
      ? selection.activeProfile
      : undefined;

  if (isCountrySet(selection)) return <SetCaption />;
  if (profile?.kind === "location") return <LocationCaption locationIdx={profile.location.key} />;
  if (profile?.kind === "country") return <CountryCaption countryIdx={profile.country.key} />;
  if (profile?.kind === "market") return <MarketCaption marketId={profile.market.key} />;
  return <WorldCaption narrowed={selection != null && !selection.isEmpty} />;
}

/**
 * The subject of the rows as a heading. A selected location leads with its value in a mode without a scale, as `answer`.
 * The map key has the variants and the scale.
 */
function CaptionHead({
  answer,
  title,
}: {
  answer?: React.ReactNode;
  /** The heading, when the selection changes what the rows are */
  title?: string;
}) {
  const mode = useEu5MapMode();
  const selection = useEu5SelectionState();
  const entity =
    selection && !selection.isEmpty && selection.preset !== "players"
      ? selection.activeProfile
      : undefined;

  // The heading states what the rows are. The map select directly above names the mode.
  const multiplayer = useEu5Players().length > 1;
  const heading = title ?? captionHeading(mode, selection, multiplayer);

  return (
    <>
      {/* A long heading wraps under itself, because a heading never truncates. */}
      <div className="flex items-start gap-3 px-3.5 pt-3 pb-1 max-md:min-h-10 max-md:items-center max-md:py-0">
        <h2 className="mt-0.5 min-w-0 flex-1 text-[17px] leading-tight font-medium text-game-ink-100 max-md:mt-0">
          {heading}
        </h2>
      </div>
      {entity ? <SelectedFigures profile={entity} /> : null}
      {answer}
    </>
  );
}

/** No selection, or a selection of land: the world's ranking, narrowed to the selection */
function WorldCaption({ narrowed }: { narrowed: boolean }) {
  const mode = useEu5MapMode();
  const players = useEu5Players();
  // In single player the player's own country stays on top of the world
  // ranking. A multiplayer save has the Players preset for that.
  const lift = !narrowed && players.length === 1 ? [players[0].countryIdx] : [];
  return (
    <>
      <CaptionHead />
      <div>
        <ModeRanking key={mode} mode={mode} lift={lift} />
      </div>
    </>
  );
}

/**
 * A set of countries: their ranking in the open mode, as the map lights
 * their land. The chip bar has the way into the Compare level.
 */
function SetCaption() {
  const mode = useEu5MapMode();
  return (
    <>
      <CaptionHead />
      <div>
        <ModeRanking key={mode} mode={mode} />
        <SetLeaders />
      </div>
    </>
  );
}

/**
 * One country. A country mode lists its locations by the mode's value, and
 * the political mode lists its overlord and subjects. The other modes list
 * the country's part of what they colour.
 */
function CountryCaption({ countryIdx }: { countryIdx: number }) {
  const mode = useEu5MapMode();
  const profile = useCountryProfile(countryIdx);

  if (!profile) return <ProfileSkeleton />;

  return (
    <>
      <CaptionHead title={mode === "political" ? relationsTitle(profile) : undefined} />
      <div>
        {mode === "political" ? (
          <DiplomacyRows profile={profile} />
        ) : isCountryMode(mode) ? (
          <CountryLocations key={mode} mode={mode} profile={profile} />
        ) : (
          <ModeRanking key={mode} mode={mode} />
        )}
      </div>
    </>
  );
}

/** The heading of a country's rows in the political mode, which says whose rows they are */
function relationsTitle({ header, diplomacy }: CountryProfile): string {
  const owner = possessive(header.name);
  return diplomacy.overlord && diplomacy.subjects.length === 0
    ? `${owner} overlord`
    : `${owner} subjects`;
}

/** The country's locations, by the mode's value */
function CountryLocations({ mode, profile }: { mode: MapMode; profile: CountryProfile }) {
  const gradient = useEu5MapModeGradient();
  const palettes = useEu5PaletteGradients();
  // The profile has no growth, so growth comes from the insight of the selection.
  const growth = useEu5SelectionTrigger(
    (engine) =>
      mode === "populationGrowth"
        ? engine.queries.getPopulationGrowthInsight().then((x) => x.topLocations)
        : Promise.resolve(null),
    [mode],
  ).data;

  // Each row's mark is the colour that the map gives the location, so the list is
  // also the map's key, and the reader finds a row's location by its colour.
  const swatch = (value: number) =>
    gradient ? rampColor(palettes[gradient.palette], legendPosition(gradient, value)) : undefined;
  const rows: Ranked[] =
    mode === "populationGrowth"
      ? (growth ?? []).map((r) => ({
          key: r.location.key,
          name: r.location.name,
          color: swatch(r.growthRate) ?? "",
          value: r.growthRate,
          location: { key: r.location.key, name: r.location.name },
        }))
      : profile.locations.locations
          .map((r) => ({ row: r, value: locationRowValue(r, mode) }))
          .filter((x): x is { row: typeof x.row; value: number } => x.value !== null)
          .sort(byDesc((x) => x.value))
          .map(({ row, value }) => ({
            key: row.location.key,
            name: row.location.name,
            color: swatch(value) ?? "",
            value,
            location: { key: row.location.key, name: row.location.name },
          }));

  return <RankList mode={mode} ranking={{ noun: "Locations", unit: UNITS[mode] ?? "", rows }} />;
}

/** What the value of a location row is, for the band */
const UNITS: Partial<Record<MapMode, string>> = {
  control: "Control",
  development: "Dev",
  stateEfficacy: "Eff. Dev",
  wealth: "Wealth",
  unrealizedTaxBase: "Tax Gap",
  population: "Pop",
  populationGrowth: "Growth / yr",
};

const SUBJECTS: Partial<Record<DiplomacySubjectType, string>> = {
  Tributary: "Tributaries",
  March: "Marches",
  "Hanseatic Member": "Hanseatic Members",
  "Maha Samanta": "Maha Samantas",
};

/** The overlord and the subjects of the country, in their game colours */
function DiplomacyRows({ profile }: { profile: CountryProfile }) {
  const { diplomacy } = profile;
  const groups: { label: string; rows: Ranked[] }[] = [];
  if (diplomacy.overlord && diplomacy.overlordMetrics) {
    groups.push({
      label: diplomacy.overlordSubjectType ? `${diplomacy.overlordSubjectType} of` : "Overlord",
      rows: [countryRow(diplomacy.overlord, diplomacy.overlordMetrics.totalStateEfficacy)],
    });
  }
  const byType = new Map<DiplomacySubjectType, Ranked[]>();
  for (const s of diplomacy.subjects) {
    const rows = byType.get(s.subjectType) ?? [];
    rows.push(countryRow(s.entity, s.metrics.totalStateEfficacy));
    byType.set(s.subjectType, rows);
  }
  for (const [type, rows] of byType) {
    const label = rows.length > 1 ? (SUBJECTS[type] ?? `${type}s`) : type;
    groups.push({ label, rows: rows.sort(byDesc((r) => r.value)) });
  }

  const all = groups.flatMap((g) => g.rows);
  const largest = Math.max(0, ...all.map((r) => r.value));
  const row = (r: Ranked) => (
    <RankRow
      key={r.key}
      row={r}
      display={formatMetric(r.value)}
      fraction={largest > 0 ? Math.max(0, r.value) / largest : 0}
    />
  );

  const leader = [...all].sort(byDesc((r) => r.value))[0];
  return (
    <>
      {leader && all.length > 1 ? (
        <p className="px-3.5 pb-2 text-[12px] leading-tight text-game-ink-300">
          {leader.name} leads with {formatMetric(leader.value)}
        </p>
      ) : null}
      {groups.length === 0 ? (
        <Band label="No overlord or subjects" flush />
      ) : (
        groups.map((g, i) => (
          <div key={g.label}>
            <Band
              label={g.label}
              columns={i === 0 ? "Total Eff. Dev" : undefined}
              flush={i === 0}
            />
            {g.rows.map(row)}
          </div>
        ))
      )}
    </>
  );
}

/** One market. The markets mode lists its goods by value; the other modes narrow to its land. */
function MarketCaption({ marketId }: { marketId: number }) {
  const mode = useEu5MapMode();

  return (
    <>
      <CaptionHead />
      <div>
        {mode === "markets" ? (
          <MarketGoods marketId={marketId} />
        ) : (
          <ModeRanking key={mode} mode={mode} />
        )}
      </div>
    </>
  );
}

/**
 * The market's goods by imbalance in value, with the order, the bar, the icon,
 * and the signed figure of the Goods level.
 */
function MarketGoods({ marketId }: { marketId: number }) {
  const { data: goods } = useEu5Trigger(
    (engine) => engine.queries.getMarketGoodsProfile(marketId),
    [marketId],
  );
  if (!goods) return null;
  const balances = goodsByImbalance(goods, "value");
  // One grammar with the Goods level: a bar from a zero line, on one scale.
  const largest = Math.max(0, ...balances.map((r) => Math.max(r.shortage, r.surplus)));
  const rows: Ranked[] = balances
    .map((r) => ({
      key: r.good.good.key,
      name: r.good.good.name,
      color: "",
      value: Math.max(r.shortage, r.surplus),
      display: signedImbalance(r),
      title: `${r.surplus >= r.shortage ? "+" : "\u2212"}${formatExact(Math.max(r.shortage, r.surplus))}`,
      leading: <Eu5Icon family="goods" id={r.good.good.key} size="sm" alt="" />,
      barContent: <DivergingBar surplus={r.surplus / largest} shortage={r.shortage / largest} />,
    }))
    .filter((r) => r.value > 0);
  return (
    <RankList
      mode="markets"
      ranking={{ noun: "Goods", unit: "", diverging: true, cap: GOODS_SHOWN, rows, quiet: true }}
    />
  );
}

/** One location: the mode's answer for it first, then its parts in place */
function LocationCaption({ locationIdx }: { locationIdx: number }) {
  const mode = useEu5MapMode();
  const { data: profile } = useEu5Trigger(
    (engine) => engine.queries.getLocationProfile(locationIdx),
    [locationIdx],
  );
  if (!profile) return <ProfileSkeleton />;

  return (
    <>
      <CaptionHead answer={<LocationAnswer profile={profile} mode={mode} />} />
      <div>
        <LocationParts profile={profile} mode={mode} />
      </div>
    </>
  );
}

/**
 * What a mode without a scale says about one location: its owner, its
 * market, or its main religion with the share of its people. The owner and the
 * market are links, because the row under the answer that they replace was one.
 */
function LocationAnswer({ profile, mode }: { profile: LocationProfile; mode: MapMode }) {
  const { header, stats } = profile;
  if (mode === "political" && header.owner) {
    return (
      <p className="flex min-w-0 items-center px-3.5 pb-3">
        <CountryLink country={header.owner} size="md">
          <EntityName className="text-[14px] leading-tight font-medium">
            {header.owner.country.name}
          </EntityName>
        </CountryLink>
      </p>
    );
  }
  if (mode === "markets" && header.market) {
    return (
      <p className="flex min-w-0 items-center gap-2 px-3.5 pb-3">
        <MarketLink market={header.market} size="md">
          <EntityName className="text-[14px] leading-tight font-medium">
            {header.market.market.name}
          </EntityName>
        </MarketLink>
        <span className="shrink-0 font-game-num text-[12px] text-game-ink-300 tabular-nums">
          {formatPercent(stats.marketAccess)} access
        </span>
      </p>
    );
  }
  if (mode === "religion" && stats.religion) {
    const religion = stats.religion;
    const pops = profile.populationProfile;
    const people = pops.reduce((sum, p) => sum + p.size, 0);
    const followers = pops.filter((p) => p.religion.key === religion.key);
    const share = people > 0 ? followers.reduce((sum, p) => sum + p.size, 0) / people : null;
    return (
      <Answer
        color={followers[0]?.religionColorHex ?? null}
        name={religion.name}
        detail={share !== null ? formatPercent(share) : undefined}
      />
    );
  }
  return null;
}

function Answer({ color, name, detail }: { color: string | null; name: string; detail?: string }) {
  return (
    <p className="flex min-w-0 items-center gap-2 px-3.5 pb-3">
      <Swatch color={color} size={14} />
      {/* Brass is for the selection and an active state, and this value is neither. */}
      <span className="truncate text-[14px] leading-tight font-medium text-game-ink-100">
        {name}
      </span>
      {detail ? (
        <span className="shrink-0 font-game-num text-[12px] text-game-ink-300 tabular-nums">
          {detail}
        </span>
      ) : null}
    </p>
  );
}
