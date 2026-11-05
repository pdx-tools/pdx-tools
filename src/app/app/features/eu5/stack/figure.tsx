import { formatLongDate } from "@/features/timeline/date";
import { gradientLabel } from "../control-panel/Legend/GradientLegend";
import { parentOf } from "../control-panel/modeConfig";
import { OVERVIEW } from "../features/profiles/country/EconomyTab";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import {
  useEu5CustomTitle,
  useEu5MapMode,
  useEu5MapModeGradient,
  useEu5SaveDate,
  useEu5SelectionState,
  useEu5TimelineLive,
  useEu5TimelineMapDate,
} from "../store";
import { useDatedCountry } from "./datedCountry";
import { useLensTitle } from "./lensTitle";
import { rankFormatter, useRanking } from "./ModeRanking";
import type { Ranked } from "./ModeRanking";
import { useCampaignTitle, useSavedCountryName } from "./HomeName";
import { figureTitle, isCategoryRows, isCountrySet, scopeLand, selectionName } from "./selection";
import type { FigureFacts } from "./selection";

/** The figure of the overview that each mode shows */
const MODE_FIGURE: Partial<Record<string, string>> = {
  political: "Score",
  stateEfficacy: "Eff. Dev",
  wealth: "Wealth",
  population: "Population",
  buildingLevels: "Buildings",
};

/** How a title says what a mode measures */
const METRIC_WORDS: Partial<Record<string, string>> = {
  political: "score",
  control: "control",
  development: "total development",
  stateEfficacy: "total effective development",
  wealth: "total wealth",
  population: "total population",
  populationGrowth: "growth",
  unrealizedTaxBase: "total tax base gap",
  markets: "market value",
  religion: "followers",
  rgoLevel: "RGO levels",
  buildingLevels: "building levels",
};

/** What the map shows when the list has a total for each country */
const MAP_MEASURE: Partial<Record<string, string>> = {
  development: "development per location",
  stateEfficacy: "effective development per location",
  wealth: "wealth per location",
  population: "people per location",
  unrealizedTaxBase: "gap per location, bright means more uncollected",
  rgoLevel: "RGO level per location",
  buildingLevels: "building levels per location",
};

/** A variant of a mode has a name of its own in a title. */
const VARIANT_LABELS: Partial<Record<string, string>> = {
  stateEfficacy: "Effective development",
  unrealizedTaxBase: "Tax base gap",
  populationGrowth: "Population growth",
};

/**
 * The map as one captioned figure: its title, the campaign and date, and what the
 * key says. The caption on the screen and the image of the map read from this, so
 * the image is what the screen shows.
 */
export function useFigure() {
  const mode = useEu5MapMode();
  const selection = useEu5SelectionState();
  const live = useEu5TimelineLive();
  const mapDate = useEu5TimelineMapDate();
  const saveDate = useEu5SaveDate();
  const as = useSavedCountryName();
  const gradient = useEu5MapModeGradient();
  const ranking = useRanking(mode);
  const profile = selection?.preset === "players" ? undefined : selection?.activeProfile;
  const countryIdx = profile?.kind === "country" ? profile.country.key : null;
  const locationIdx = profile?.kind === "location" ? profile.location.key : null;

  const { data: country } = useEu5Trigger(
    (e) =>
      countryIdx === null ? Promise.resolve(undefined) : e.queries.getCountryProfile(countryIdx),
    [countryIdx],
  );
  const datedLand = useDatedCountry(countryIdx);
  const { data: location } = useEu5Trigger(
    (e) =>
      locationIdx === null ? Promise.resolve(undefined) : e.queries.getLocationProfile(locationIdx),
    [locationIdx],
  );

  const facts: FigureFacts = {};
  if (!live) facts.pastDate = formatLongDate(mapDate);
  if (profile?.kind === "country") {
    facts.entity = { kind: "country", name: datedLand?.name ?? profile.country.name };
    if (datedLand) facts.datedLand = datedLand;
    const figureName = MODE_FIGURE[mode];
    const figure = OVERVIEW.flatMap((g) => g.figures).find((f) => f.label === figureName);
    const rank = country && figure?.rank?.(country.overview);
    if (country && rank && country.header.headline.locationCount > 0) {
      facts.entityRank = {
        rank,
        of: country.overview.ranks.cohort,
        label: figure?.label ?? "",
      };
    }
  } else if (profile?.kind === "market") {
    facts.entity = { kind: "market", name: profile.market.name };
  } else if (profile?.kind === "location") {
    facts.entity = {
      kind: "location",
      name: profile.location.name,
      owner: location?.header.owner?.country.name,
    };
  } else if (selection && !selection.isEmpty && isCountrySet(selection)) {
    facts.set = {
      name: selectionName(selection),
      land: isCategoryRows(mode) ? scopeLand(selection) : undefined,
    };
  }
  const leader = ranking?.rows[0];
  const next = ranking?.rows[1];
  const shownOf = (row: Ranked) =>
    row.display ?? (ranking ? rankFormatter(ranking, mode)(row.value) : "");
  if (leader && ranking) {
    facts.leader = {
      name: leader.name,
      shown: shownOf(leader),
      metric: METRIC_WORDS[mode] ?? (ranking.unit.replace(/^Total /, "").toLowerCase() || "value"),
      tiedWith:
        next && shownOf(next) === shownOf(leader) && next.value !== leader.value
          ? next.name
          : undefined,
      largest: mode === "unrealizedTaxBase",
      mapMeasure: MAP_MEASURE[mode],
    };
  }
  const label = VARIANT_LABELS[mode] ?? parentOf(mode).label;
  const lensTitle = useLensTitle();
  const title = lensTitle ?? figureTitle(facts, label);
  const date = live ? saveDate : mapDate;
  const name = useCampaignTitle();
  const custom = useEu5CustomTitle();
  const subtitle = `${name}${as && !custom ? ` as ${as}` : ""}, ${formatLongDate(date)}`;
  const keyLabel = gradient
    ? `${gradientLabel(mode)} per location`
    : mode === "political"
      ? "Colour: owner. Stripes: occupier"
      : mode === "religion"
        ? "Colour: main religion. Stripes: owner's religion"
        : "Colour: market. Brightness: market access";
  return { title, subtitle, keyLabel, leaderName: leader?.name, modeLabel: label };
}
