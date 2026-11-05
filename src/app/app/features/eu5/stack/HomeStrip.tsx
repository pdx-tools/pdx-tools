import { useState } from "react";
import { cx } from "class-variance-authority";
import ChevronRightIcon from "@heroicons/react/20/solid/ChevronRightIcon";
import PlayIcon from "@heroicons/react/16/solid/PlayIcon";
import { focusRing } from "@/components/game/focusRing";
import { formatFixedPercent, formatInt } from "@/lib/format";
import type { CountryProfile, LandPoint, MapMode } from "@/wasm/wasm_eu5";
import { GameButton } from "../components";
import { Eu5Flag } from "../components/flags/Eu5Flag";
import { OVERVIEW } from "../features/profiles/country/EconomyTab";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { parentOf } from "../control-panel/modeConfig";
import { useEu5Engine, useEu5HomeCountry, useEu5MapMode, useEu5Timeline } from "../store";
import { useRanking } from "./ModeRanking";
import type { Ranking } from "./ModeRanking";
import { useFrameSelection } from "./frameSelection";
import { PlayerTag } from "./parts";
import { MASS_TIE, landChapters } from "./selection";

/**
 * Where the save's own country stands, on top of the world's list. It answers the
 * first question of a save at rest: the rank in what the map shows, and the
 * strongest and weakest ranks. A click selects the country.
 */
export function HomeStrip() {
  const home = useEu5HomeCountry();
  const engine = useEu5Engine();
  const frame = useFrameSelection();
  const mode = useEu5MapMode();
  const ranking = useRanking(mode);
  const countryIdx = home?.countryIdx ?? null;
  const { data: profile } = useEu5Trigger(
    (e) =>
      countryIdx === null ? Promise.resolve(undefined) : e.queries.getCountryProfile(countryIdx),
    [countryIdx],
  );
  if (!home || !profile) return null;

  return (
    <HomeCard
      home={home}
      profile={profile}
      mode={mode}
      ranking={ranking}
      frameThen={() => void engine.commands.selectCountry(home.countryIdx).then(frame)}
    />
  );
}

function HomeCard({
  home,
  profile,
  mode,
  ranking,
  frameThen,
}: {
  home: { countryIdx: number };
  profile: CountryProfile;
  mode: MapMode;
  ranking: Ranking | null;
  frameThen: () => void;
}) {
  const engine = useEu5Engine();
  const timeline = useEu5Timeline();
  const anchor = profile.header.anchorLocationIdx;
  const { data: capital } = useEu5Trigger(
    (e) => (mode === "markets" ? e.queries.getLocationProfile(anchor) : Promise.resolve(undefined)),
    [mode, anchor],
  );
  const { data: history } = useEu5Trigger(
    (e) => e.queries.getLandHistory(home.countryIdx),
    [home.countryIdx],
  );
  const { overview, header } = profile;
  const { cohort } = overview.ranks;
  const ranked = OVERVIEW.flatMap(({ figures }) => figures).flatMap((figure) => {
    const rank = figure.rank?.(overview);
    return rank !== undefined && (figure.tied?.(overview) ?? 1) <= MASS_TIE
      ? [{ label: figure.label, rank }]
      : [];
  });
  const strongest = ranked.reduce((a, b) => (b.rank < a.rank ? b : a), ranked[0]);
  const weakest = ranked.reduce((a, b) => (b.rank > a.rank ? b : a), ranked[0]);

  // A list that ranks countries gives the rank in the open mode.
  const at = ranking?.rows.findIndex((row) => row.country?.country.key === home.countryIdx) ?? -1;
  const greatPower = `Score #${formatInt(overview.ranks.greatPower)} of ${formatInt(cohort)}`;
  const religions = profile.religion.religionBreakdown;
  const people = religions.reduce((sum, row) => sum + row.population, 0);
  const faith = [...religions].sort((a, b) => b.population - a.population)[0];
  const marketRank =
    capital?.header.market && ranking
      ? ranking.rows.findIndex(
          (row) => row.market?.market.key === capital.header.market?.market.key,
        )
      : -1;
  const standing =
    mode === "political"
      ? greatPower
      : mode === "religion" && faith && people > 0
        ? `${faith.religion.name}: ${formatFixedPercent(faith.population / people)} of the people`
        : mode === "markets" && capital?.header.market && marketRank >= 0
          ? `${capital.header.market.market.name}: #${formatInt(marketRank + 1)} of ${formatInt(ranking?.rows.length ?? 0)}`
          : mode === "control"
            ? overview.ranks.control > 0
              ? `#${formatInt(overview.ranks.control)} of ${formatInt(overview.ranks.controlCohort)} by Control`
              : "Control: under 10 locations, no rank"
            : at >= 0 && ranking
              ? `#${formatInt(at + 1)} of ${formatInt(ranking.rows.length)} by ${ranking.unit}`
              : greatPower;
  const chapters = history ? landChapters(history) : [];
  const start = history?.points.find((p) => p.locations > 0);
  const end = history?.points[history.points.length - 1];

  const [cameFrom, setCameFrom] = useState<MapMode | null>(null);
  const play = async () => {
    if (mode !== "political") {
      setCameFrom(mode);
      await engine.trigger.selectMapMode("political");
    }
    engine.trigger.pauseTimeline();
    engine.trigger.setTimelineDate(timeline.start);
    engine.trigger.toggleTimelinePlayback();
  };

  return (
    <section
      aria-label={`${header.name}'s campaign`}
      className="border-b border-game-line bg-game-panel-2 px-3.5 py-2.5"
    >
      <button
        type="button"
        onClick={frameThen}
        className={cx(
          "group flex w-full cursor-pointer items-center gap-3 rounded-[2px] text-left",
          focusRing,
        )}
      >
        <Eu5Flag
          flag={header.flag}
          colorHex={header.colorHex}
          size="sm"
          alt=""
          className="shrink-0 rounded-[2px] border border-game-rim"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] leading-tight font-medium text-game-ink-100 group-hover:underline">
              {header.name}
            </span>
            <PlayerTag />
            <span className="ml-auto shrink-0 font-game-num text-[12px] text-game-ink-100">
              {standing}
            </span>
          </span>
          {strongest && weakest && strongest !== weakest ? (
            <span className="text-[12px] leading-tight text-game-ink-300">
              Strongest: {strongest.label} #{formatInt(strongest.rank)}. Weakest: {weakest.label} #
              {formatInt(weakest.rank)}
            </span>
          ) : null}
        </span>
        <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 text-game-ink-500" />
      </button>
      {history && start && end ? (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <LandSpark
              points={history.points}
              peakYear={history.peak.year}
              color={header.colorHex}
            />
            <p className="mt-1 text-[12px] leading-snug text-game-ink-300">
              {formatInt(start.locations)} to {formatInt(end.locations)} locations since{" "}
              {start.year}. Peak {formatInt(history.peak.locations)} in {history.peak.year}
              {history.biggestGain
                ? `. Largest gain +${formatInt(history.biggestGain.change)} in ${history.biggestGain.year}`
                : ""}
              .
            </p>
          </div>
          {chapters.length > 0 ? (
            <span className="flex flex-col items-end gap-1">
              <GameButton
                onClick={() => void play()}
                // Only borders have a history, so the map must change for the replay.
                title={mode === "political" ? undefined : "Switches the map to Political"}
              >
                <PlayIcon aria-hidden className="h-3 w-3" />
                {mode === "political" ? "Play campaign" : "Play on Political"}
              </GameButton>
              {cameFrom && mode === "political" ? (
                <GameButton
                  onClick={() => {
                    void engine.trigger.selectMapMode(cameFrom);
                    setCameFrom(null);
                  }}
                >
                  Back to {parentOf(cameFrom).label}
                </GameButton>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const SPARK_WIDTH = 240;
const SPARK_HEIGHT = 34;

/** The arc of the country's land, with its peak marked */
function LandSpark({
  points,
  peakYear,
  color,
}: {
  points: readonly LandPoint[];
  peakYear: number;
  color: string;
}) {
  const largest = Math.max(1, ...points.map((p) => p.locations));
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * SPARK_WIDTH;
  const y = (v: number) => SPARK_HEIGHT - (v / largest) * (SPARK_HEIGHT - 4) - 1;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.locations).toFixed(1)}`).join(" ");
  const peakAt = points.findIndex((p) => p.year === peakYear);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      className="block h-[34px] w-full"
    >
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
      />
      {peakAt >= 0 ? (
        <circle
          cx={x(peakAt)}
          cy={y(points[peakAt].locations)}
          r={2.5}
          fill="var(--game-ink-100)"
        />
      ) : null}
    </svg>
  );
}
