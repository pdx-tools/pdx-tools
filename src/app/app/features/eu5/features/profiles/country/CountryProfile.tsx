import { formatCount, formatFixedPercent, formatInt } from "@/lib/format";
import { CountryOverviewTabContent, OVERVIEW } from "./EconomyTab";
import { ReligionTabContent } from "./ReligionTab";
import { CountryPopulationTabContent } from "./PopulationTab";
import { LocationsTabContent } from "./LocationsTab";
import { DiplomacyTabContent } from "./DiplomacyTab";
import { useEu5MapMode } from "../../../store";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";
import { EntityProfileTitle } from "../ProfileTitle";
import { usePanelNav, sectionEntry } from "../PanelNavContext";
import type { ProfileSection } from "../PanelNavContext";
import { Finding, Row } from "../../../stack/parts";
import { profileFinding } from "../../../stack/selection";

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

  const finding = profileFinding(
    profile.header.name,
    OVERVIEW.flatMap(({ figures }) => figures).map((figure) => ({
      label: figure.label,
      rank: figure.rank?.(profile.overview),
    })),
  );
  // Each row previews what it opens, from data that the profile already has.
  const religions = profile.religion.religionBreakdown;
  const religionTotal = religions.reduce((sum, row) => sum + row.population, 0);
  const topReligion = [...religions].sort((a, b) => b.population - a.population)[0];
  const subjects = profile.diplomacy.subjects.length;

  return (
    <>
      {finding ? <Finding>{finding}</Finding> : null}
      <EntityProfileTitle header={profile.header} />
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
        name="Diplomacy"
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
        onOpen={() => open("diplomacy", "Diplomacy")}
      />
      <Row
        name="Locations"
        value={formatInt(locations.length)}
        onOpen={() => open("locations", "Locations")}
      />
      <CountryOverviewTabContent data={profile.overview} locations={locations} />
    </>
  );
}
