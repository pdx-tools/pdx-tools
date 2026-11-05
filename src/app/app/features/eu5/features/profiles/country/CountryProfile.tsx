import { useEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { formatCount, formatFixedPercent, formatInt } from "@/lib/format";
import { CountryCharts, CountryRankRail, HistoryChart, OVERVIEW } from "./EconomyTab";
import {
  CountryModeBlock,
  DatedLead,
  countryModeLine,
  GreatPowerNeighbours,
  LandOverTime,
  PeerLine,
} from "./CountryBlocks";
import { ReligionTabContent } from "./ReligionTab";
import { CountryPopulationTabContent } from "./PopulationTab";
import { LocationsTabContent } from "./LocationsTab";
import { DiplomacyTabContent } from "./DiplomacyTab";
import { formatLongDate } from "@/features/timeline/date";
import { useEu5MapMode, useEu5Players, useEu5SaveDate, useEu5TimelineLive } from "../../../store";
import { useStandings } from "../../../stack/Standings";
import { levelBody } from "../../../stack/levelBody";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";
import { EntityProfileTitle } from "../ProfileTitle";
import { usePanelNav, sectionEntry } from "../PanelNavContext";
import type { ProfileSection } from "../PanelNavContext";
import { Finding, Row } from "../../../stack/parts";
import { useDatedCountry } from "../../../stack/datedCountry";
import { currentJump, leadChartOf, profileFinding } from "../../../stack/selection";
import type { LeadChart } from "../../../stack/selection";

const JUMPS = ["Details", "Ranks", "Rivals by score", "Charts"];
/** How far under the top of the scroller a part counts as the current one, past this bar */
const JUMP_LINE = 40;
const LANDLESS_JUMPS = ["Details", "Charts"];

/** The long view of a country has one row that stays, says where the reader is, and goes to each part. */
function JumpIndex({ parts }: { parts: readonly string[] }) {
  const [current, setCurrent] = useState(parts[0]);
  const ref = useRef<HTMLElement>(null);
  // A click names the part until the reader scrolls: a short last part cannot reach the line.
  const pinned = useRef(false);
  useEffect(() => {
    const body = ref.current?.closest<HTMLElement>("[data-column-body]");
    if (!body) return;
    const onScroll = () => {
      if (pinned.current) return;
      const top = body.getBoundingClientRect().top;
      setCurrent(
        currentJump(
          parts.map((name) => ({
            name,
            top:
              (body.querySelector(`[data-jump="${name}"]`)?.getBoundingClientRect().top ?? top) -
              top,
          })),
          JUMP_LINE,
          body.scrollTop + body.clientHeight >= body.scrollHeight - 1,
        ) ?? parts[0],
      );
    };
    const release = () => {
      pinned.current = false;
    };
    const events = ["wheel", "touchmove", "pointerdown", "keydown"] as const;
    for (const event of events) body.addEventListener(event, release, { passive: true });
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      for (const event of events) body.removeEventListener(event, release);
      body.removeEventListener("scroll", onScroll);
    };
  }, [parts]);
  const go = (name: string) => {
    pinned.current = true;
    setCurrent(name);
    document.querySelector(`[data-jump="${name}"]`)?.scrollIntoView({ block: "start" });
  };
  return (
    <nav
      ref={ref}
      aria-label="Parts of this country"
      className="sticky top-0 z-20 flex h-7 items-center gap-3 border-b border-game-line bg-game-panel px-3.5 font-game-ui text-[12px] text-game-ink-300"
    >
      {parts.map((name) => (
        <button
          key={name}
          type="button"
          aria-current={current === name ? "location" : undefined}
          onClick={() => go(name)}
          className={cx(
            "h-6 cursor-pointer rounded-[2px] hover:text-game-ink-100",
            current === name && "font-medium text-game-ink-100 underline underline-offset-4",
            focusRing,
          )}
        >
          {name}
        </button>
      ))}
    </nav>
  );
}

/** The place of a part. The bar stands over the top of the scroller, so the part stops under it. */
const jumpMark = "scroll-mt-7";

/**
 * A country level. Without a section it is the overview, which opens the
 * other parts of the country as levels of their own.
 */
export function CountryProfile({
  countryIdx,
  section,
}: {
  countryIdx: number;
  section?: ProfileSection;
}) {
  const mode = useEu5MapMode();
  const nav = usePanelNav();
  const { data: profile, loading } = useEu5Trigger(
    (engine) => engine.queries.getCountryProfile(countryIdx),
    [countryIdx],
  );
  const live = useEu5TimelineLive();
  const players = useEu5Players();
  // Only a player's country has a place among the players.
  const isPlayer = players.length > 1 && players.some((p) => p.countryIdx === countryIdx);
  // The save keeps a record for each person who ever joined, so a country can repeat.
  const standings = useStandings(isPlayer ? [...new Set(players.map((p) => p.countryIdx))] : []);
  const peers =
    isPlayer && standings
      ? standings
          .filter((x) => x.profile.header.headline.locationCount > 0)
          .map((x) => x.profile.overview)
      : undefined;
  const dated = useDatedCountry(countryIdx);
  const saveDate = useEu5SaveDate();
  const { data: history } = useEu5Trigger(
    (engine) => engine.queries.getLandHistory(countryIdx),
    [countryIdx],
  );
  if (loading && !profile) return <ProfileSkeleton />;
  if (!profile) return null;

  const locations = profile.locations.locations;

  if (section === "religion") {
    return <ReligionTabContent data={profile.religion} />;
  }
  if (section === "population") {
    return (
      <CountryPopulationTabContent
        countryIdx={countryIdx}
        locations={locations}
        historicalPopulation={profile.overview.historicalPopulation}
      />
    );
  }
  if (section === "locations") {
    return <LocationsTabContent locations={locations} mode={mode} />;
  }
  if (section === "diplomacy") {
    return <DiplomacyTabContent data={profile.diplomacy} />;
  }

  const identity = {
    kind: "country" as const,
    country: { key: countryIdx, name: profile.header.name },
  };
  const open = (part: ProfileSection, label: string) =>
    nav.open(sectionEntry(identity, part, label));

  const landless = profile.header.headline.locationCount === 0;
  const leadChart = leadChartOf(mode, history !== undefined);
  const modeLine = countryModeLine(profile, mode, peers);
  const modeLeads = mode !== "political" && live && !landless;
  const finding = profileFinding(
    profile.header.name,
    OVERVIEW.flatMap(({ figures }) => figures).map((figure) => ({
      label: figure.label,
      rank: figure.rank?.(profile.overview),
      tied: figure.tied?.(profile.overview),
    })),
    profile.overview.ranks.cohort,
  );
  // Each row previews what it opens, from data that the profile already has.
  const religions = profile.religion.religionBreakdown;
  const religionTotal = religions.reduce((sum, row) => sum + row.population, 0);
  const topReligion = [...religions].sort((a, b) => b.population - a.population)[0];
  const subjects = profile.diplomacy.subjects.length;

  const saveDateText = !live ? formatLongDate(saveDate) : undefined;
  const chartOf = (chart: NonNullable<LeadChart>) =>
    chart === "population" ? (
      <HistoryChart
        title={`${profile.header.name}: population by year`}
        series={profile.overview.historicalPopulation}
        yLabel="Population"
        isYearly
        whole
        now={profile.overview.totalPopulation}
      />
    ) : chart === "taxBase" ? (
      <HistoryChart
        title={`${profile.header.name}: tax base by year`}
        series={profile.overview.historicalTaxBase}
        yLabel="Tax Base"
        isYearly
        now={profile.overview.taxBase}
      />
    ) : history ? (
      <LandOverTime history={history} name={profile.header.name} />
    ) : null;

  return (
    <>
      {!live ? (
        <DatedLead countryIdx={countryIdx} name={profile.header.name} />
      ) : landless ? (
        <Finding>{`${profile.header.name} holds no land at the save.`}</Finding>
      ) : modeLeads && modeLine ? (
        <Finding>{modeLine}</Finding>
      ) : !modeLeads && finding ? (
        <Finding>{finding}</Finding>
      ) : null}
      {/* The chosen mode leads: its list, and its chart if it has one by year. */}
      {modeLeads ? <CountryModeBlock profile={profile} countryIdx={countryIdx} /> : null}
      {modeLeads && leadChart ? <div className={levelBody}>{chartOf(leadChart)}</div> : null}
      {/* The rows under this line stay the same in each mode. */}
      {modeLeads && finding && modeLine ? (
        <p className="border-t border-game-line px-3.5 pt-2.5 text-[12px] leading-snug text-game-ink-300">
          {finding}
        </p>
      ) : null}
      {live && !landless ? <PeerLine countryIdx={countryIdx} /> : null}
      <JumpIndex parts={landless ? LANDLESS_JUMPS : JUMPS} />
      <EntityProfileTitle
        header={
          dated
            ? {
                ...profile.header,
                name: dated.name,
                tag: dated.tag,
                flag: dated.flag,
                colorHex: dated.colorHex,
              }
            : profile.header
        }
        inStrip
        statsLabel={saveDateText ? `At the save, ${saveDateText}` : undefined}
      />
      {!modeLeads && leadChart ? (
        leadChart === "land" ? (
          chartOf("land")
        ) : (
          <div className={levelBody}>{chartOf(leadChart)}</div>
        )
      ) : null}
      {landless || modeLeads ? null : (
        <CountryModeBlock profile={profile} countryIdx={countryIdx} />
      )}
      <div data-jump="Details" className={jumpMark} />
      <Row
        name="Religion"
        value={
          topReligion && religionTotal > 0 ? (
            <>
              <span className="font-game-ui font-normal text-game-ink-300">
                {topReligion.religion.name}
              </span>{" "}
              {formatFixedPercent(topReligion.population / religionTotal)}
            </>
          ) : undefined
        }
        onOpen={() => open("religion", "Religion")}
      />
      <Row
        name="Population"
        value={formatCount(profile.header.headline.totalPopulation)}
        onOpen={() => open("population", "Population")}
      />
      <Row
        name="Overlord and subjects"
        value={
          subjects > 0 ? (
            <>
              {formatInt(subjects)}{" "}
              <span className="font-game-ui font-normal text-game-ink-300">
                {subjects === 1 ? "subject" : "subjects"}
              </span>
            </>
          ) : undefined
        }
        onOpen={() => open("diplomacy", "Overlord and subjects")}
      />
      <Row
        name="Locations"
        value={formatInt(locations.length)}
        onOpen={() => open("locations", "Locations")}
      />
      {landless ? null : (
        <>
          <div data-jump="Ranks" className={jumpMark} />
          <CountryRankRail data={profile.overview} atSave={saveDateText} peers={peers} />
          <div data-jump="Rivals by score" className={jumpMark} />
          <GreatPowerNeighbours countryIdx={countryIdx} cohort={profile.overview.ranks.cohort} />
        </>
      )}
      <div data-jump="Charts" className={jumpMark} />
      {leadChart !== "land" && history ? (
        <LandOverTime history={history} name={profile.header.name} />
      ) : null}
      <CountryCharts
        name={profile.header.name}
        data={profile.overview}
        locations={locations}
        lead={leadChart}
      />
    </>
  );
}
