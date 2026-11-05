import type React from "react";
import { useEffect, useRef } from "react";
import { formatCount, formatExact, formatInt, formatMetric, formatPercent } from "@/lib/format";
import type { LocationProfile, MapMode } from "@/wasm/wasm_eu5";
import {
  useEu5Engine,
  useEu5HomeCountry,
  useEu5MapMode,
  useEu5MapViewport,
  useEu5Players,
  useEu5SelectionState,
  useEu5TimelineLive,
} from "../store";
import { EntityName } from "../components/EntityName";
import { Eu5Icon } from "../components/icons/Eu5Icon";
import { MarketLink } from "../features/profiles/EntityLink";
import { LocationParts } from "../features/profiles/location/LocationProfile";
import { useEu5SelectionTrigger } from "../features/profiles/useEu5Trigger";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { ProfileSkeleton } from "../features/profiles/ProfileSkeleton";
import {
  GOODS_SHOWN,
  goodsByImbalance,
  signedImbalance,
} from "../features/profiles/market/GoodsTab";
import { CountryProfile } from "../features/profiles/country/CountryProfile";
import { GameButton } from "../components";
import { useViewportInsets } from "../useViewportInsets";
import { compareEntry, usePanelNav } from "../features/profiles/PanelNavContext";
import { setBuildingList, useBuildingList } from "./buildingList";
import { ModeRanking, RankList, worldRankingOf } from "./ModeRanking";
import type { Ranked, Ranking } from "./ModeRanking";
import { DatedBoard, GreatPowerBoard } from "./Board";
import { HomeStrip } from "./HomeStrip";
import { RaceChart, WorldStandings, useStandings } from "./Standings";
import { WorldLandChart } from "./WorldLandChart";
import { useSelectedCountries } from "./selected";
import { useFullView } from "./fullView";
import { DivergingBar, Stat, Swatch } from "./parts";
import { SetLeaders } from "./SetLeaders";
import { SelectedFigures } from "./SelectedEntity";
import { captionHeading, isCountrySet } from "./selection";

/**
 * The root of the column is always the map's caption. A selection narrows
 * the caption in place: the selected entity heads it, and its rows are the
 * selection's part of what the mode colours.
 */
export function Caption() {
  const selection = useEu5SelectionState();
  const mode = useEu5MapMode();
  const building = useBuildingList();
  const profile =
    selection && !selection.isEmpty && selection.preset !== "players"
      ? selection.activeProfile
      : undefined;
  const empty = selection == null || selection.isEmpty;
  useEffect(() => {
    if (empty) setBuildingList(false);
  }, [empty]);
  const worldRows = building && !empty ? worldRankingOf(mode) : undefined;

  if (worldRows) return <BuildingList ranking={worldRows} />;
  if (isCountrySet(selection)) return <SetCaption />;
  if (profile?.kind === "location") return <LocationCaption locationIdx={profile.location.key} />;
  if (profile?.kind === "country") return <CountryCaption countryIdx={profile.country.key} />;
  if (profile?.kind === "market") return <MarketCaption marketId={profile.market.key} />;
  return <WorldCaption narrowed={selection != null && !selection.isEmpty} />;
}

/**
 * The world's list stays while the reader adds countries from it. The strip above has
 * the chips, and the button here goes on to compare them.
 */
function BuildingList({ ranking }: { ranking: Ranking }) {
  const mode = useEu5MapMode();
  const nav = usePanelNav();
  const selection = useEu5SelectionState();
  const count = selection?.entityCount ?? 0;
  return (
    <>
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <p className="min-w-0 flex-1 text-[13px] leading-tight text-game-ink-100">
          {`${formatInt(count)} ${count === 1 ? "country" : "countries"} chosen. + adds another.`}
        </p>
        <GameButton
          disabled={count < 2}
          onClick={() => {
            setBuildingList(false);
            nav.open(compareEntry);
          }}
        >
          Compare
        </GameButton>
      </div>
      <RankList ranking={{ ...ranking, quiet: true, floorNote: undefined }} mode={mode} />
    </>
  );
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
  const live = useEu5TimelineLive();
  const full = useFullView().on;
  if (mode === "political" && !live) {
    return (
      <div>
        <DatedBoard />
      </div>
    );
  }
  return (
    <>
      {narrowed ? null : <HomeStrip />}
      <CaptionHead />
      <div>
        {mode === "political" ? (
          full ? (
            <WorldStandings />
          ) : (
            <>
              <GroupRace />
              <GreatPowerBoard />
              <WorldLand />
            </>
          )
        ) : (
          <ModeRanking key={mode} mode={mode} />
        )}
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
  const selected = useSelectedCountries();
  const selection = useEu5SelectionState();
  const players = selection?.preset === "players";
  const full = useFullView().on;
  const large = !players && selected.length > LARGE_SET;
  // The whole frame has the room for each metric of each player.
  if (players && full && mode === "political") {
    return (
      <>
        <CaptionHead />
        <WorldStandings />
      </>
    );
  }
  return (
    <>
      <CaptionHead />
      {/* A large selection reads as one thing: its totals, then a short list. */}
      {large ? <SetTotals /> : null}
      <div>
        {mode === "political" ? (
          <>
            <GreatPowerBoard />
            {players ? <GroupRace /> : null}
          </>
        ) : (
          <ModeRanking key={mode} mode={mode} cap={large ? 12 : undefined} />
        )}
        {players ? null : <SetLeaders />}
      </div>
    </>
  );
}

/** Above this many countries a selection is an aggregate, not a list to read through */
const LARGE_SET = 20;

/** What a selection of many countries holds, together */
function SetTotals() {
  const { data } = useEu5SelectionTrigger((engine) => engine.queries.getDevelopmentInsight());
  const selection = useEu5SelectionState();
  if (!data) return null;
  const population = data.countries.reduce((sum, row) => sum + row.totalPopulation, 0);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-game-line px-3.5 pb-2.5">
      <Stat
        value={formatInt(data.countries.length)}
        // The land of the players' preset also holds their subjects.
        label={
          selection?.preset === "players"
            ? "countries, with subjects"
            : data.countries.length === 1
              ? "country"
              : "countries"
        }
      />
      <Stat
        value={formatInt(selection?.locationCount ?? 0)}
        label={selection?.locationCount === 1 ? "location" : "locations"}
      />
      <Stat value={formatMetric(data.scope.totalDevelopment)} label="Dev" />
      <Stat value={formatMetric(data.scope.avgDevelopment)} label="avg / location" />
      <Stat value={formatCount(population)} label="Pop" />
    </div>
  );
}

/** The race at the head of a multiplayer list: the leading players, by year */
function GroupRace() {
  const players = useEu5Players();
  const query = useEu5SelectionTrigger((engine) => engine.queries.getPoliticalWorldScoreboard());
  const home = useEu5HomeCountry();
  const playing = (query.data?.rows ?? [])
    .filter((row) => row.country.isPlayer)
    .map((row) => row.country.country.key);
  const all = useStandings(players.length > 1 ? playing : []);
  if (players.length < 2 || !all || all.length < 2) return null;
  // The chart's rule is the one that its title states: the most tax base at the save.
  const byTaxBase = [...all].sort(
    (a, b) => b.profile.overview.taxBase - a.profile.overview.taxBase,
  );
  const top = byTaxBase.slice(0, 6);
  const own = byTaxBase.find((row) => row.countryIdx === home?.countryIdx);
  const rows = own && !top.includes(own) ? [...top, own] : top;
  return <RaceChart rows={rows} compact />;
}

/** The land of the great powers by year, with the map's date on it, when the save has it */
function WorldLand() {
  const home = useEu5HomeCountry();
  const query = useEu5SelectionTrigger((engine) => engine.queries.getPoliticalWorldScoreboard());
  const rows = (query.data?.rows ?? []).slice(0, 6);
  const keys = [
    ...rows.map((row) => row.country.country.key),
    ...(home && !rows.some((r) => r.country.country.key === home.countryIdx)
      ? [home.countryIdx]
      : []),
  ];
  const { data } = useEu5Trigger(
    (engine) =>
      Promise.all(
        keys.map(async (key) => {
          const [history, profile] = await Promise.all([
            engine.queries.getLandHistory(key),
            engine.queries.getCountryProfile(key),
          ]);
          return history && profile ? { key, history, header: profile.header } : null;
        }),
      ),
    [keys.join(",")],
  );
  const lines = (data ?? []).flatMap((line) => {
    if (!line) return [];
    return [
      {
        name: line.header.name,
        color: line.header.colorHex,
        key: line.key,
        points: line.history.points,
      },
    ];
  });
  if (lines.length === 0) return null;
  return <WorldLandChart lines={lines} homeKey={home?.countryIdx} />;
}

/** One country: a stable view, with one block that follows the map */
function CountryCaption({ countryIdx }: { countryIdx: number }) {
  return <CountryProfile countryIdx={countryIdx} />;
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
/** How much of the world's width a framed location shows */
const LOCATION_FRAME_SHARE = 1 / 14;

/**
 * A location is about one place, so the map comes close enough to see it. A map that
 * is already close stays where it is.
 */
function useFrameLocation(locationIdx: number) {
  const engine = useEu5Engine();
  const viewport = useEu5MapViewport();
  const { left } = useViewportInsets();
  const latest = useRef({ viewport, left });
  useEffect(() => {
    latest.current = { viewport, left };
  }, [viewport, left]);
  useEffect(() => {
    let live = true;
    void engine.trigger
      .worldPointsOf([locationIdx])
      .then(([point]) => {
        const now = latest.current;
        const map = now.viewport;
        if (!live || !point || !map) return;
        const width = map.world.width * LOCATION_FRAME_SHARE;
        if (map.viewport.width <= width) return;
        const height = (width * map.viewport.height) / map.viewport.width;
        // The middle of the part of the map that the column does not cover.
        const covered = now.left / window.innerWidth;
        void engine.trigger.fitWorldRect({
          x: point.x - width * (0.5 + covered / 2),
          y: point.y - height / 2,
          width,
          height,
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [engine, locationIdx]);
}

function LocationCaption({ locationIdx }: { locationIdx: number }) {
  useFrameLocation(locationIdx);
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
  // The strip above names the owner.
  if (mode === "political") return null;
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
