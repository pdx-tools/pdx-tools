import { formatCount } from "@/lib/format";
import type { LocationProfile as LocationProfileData, MapMode } from "@/wasm/wasm_eu5";
import { LocationOverviewTab } from "./OverviewTab";
import { LocationRanksBlock } from "./LocationRanks";
import { LocationEconomyTab } from "./EconomyTab";
import { LocationPopulationTab } from "./PopulationTab";
import { usePanelNav, sectionEntry } from "../PanelNavContext";
import type { ProfileSection } from "../PanelNavContext";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";
import { Band, LevelTitle, Row } from "../../../stack/parts";
import { levelBody } from "../../../stack/levelBody";

interface Props {
  locationIdx: number;
  section?: ProfileSection;
}

/**
 * A location level. Without a section it is the overview, which opens the
 * location's buildings and population as levels of their own.
 */
export function LocationProfile({ locationIdx, section }: Props) {
  const { data: profile, loading } = useEu5Trigger(
    (engine) => engine.queries.getLocationProfile(locationIdx),
    [locationIdx],
  );

  if (loading && !profile) return <ProfileSkeleton />;
  if (!profile) return null;

  if (section === "buildings") {
    return <LocationEconomyTab profile={profile} />;
  }
  if (section === "population") {
    return (
      <div className={levelBody}>
        <LocationPopulationTab profile={profile} />
      </div>
    );
  }

  return (
    <>
      <LevelTitle title={profile.header.location.name} />
      <LocationParts profile={profile} />
    </>
  );
}

/**
 * The rows that open the parts of a location, then its facts under a band of
 * their own, so a row that goes somewhere stands apart from a row that tells
 * something. The caption of a selected location shows them in place, under a
 * block that has the headline figures. A level of its own shows them here.
 */
export function LocationParts({
  profile,
  mode,
}: {
  profile: LocationProfileData;
  /** The caption's mode: the caption already gives this mode's answer. */
  mode?: MapMode;
}) {
  const nav = usePanelNav();
  const identity = { kind: "location" as const, location: profile.header.location };
  const open = (part: ProfileSection, label: string) =>
    nav.open(sectionEntry(identity, part, label));

  return (
    <>
      <LocationRanksBlock profile={profile} mode={mode} />
      <Band label="Overview" />
      <LocationOverviewTab profile={profile} mode={mode} />
      <Row
        name="Population"
        value={formatCount(profile.stats.population)}
        onOpen={() => open("population", "Population")}
      />
      <Band
        label={
          profile.buildings.length === 1 ? "1 building" : `${profile.buildings.length} buildings`
        }
      />
      <LocationEconomyTab profile={profile} />
    </>
  );
}
