import type { ActiveProfileIdentity, MapMode } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";

/** The parts of the selection summary that the column reads */
export type SelectionLike = {
  isEmpty: boolean;
  preset?: string | null;
  activeProfile: ActiveProfileIdentity | undefined;
  entityCount: number;
  locationCount: number;
  scopeDisplayName?: string | null;
};

/**
 * True if the selection is a set of countries: the Players preset, or two
 * countries or more with no single entity to open. The caption of such a
 * selection ranks the countries, and it opens the Compare level.
 */
export function isCountrySet(selection: SelectionLike | null | undefined): boolean {
  if (selection == null || selection.isEmpty) return false;
  if (selection.preset === "players") return true;
  return selection.activeProfile === undefined && selection.entityCount > 1;
}

/** The name of the selection, for the selected line and the legend */
export function selectionName(selection: SelectionLike): string {
  if (selection.preset === "players") return "Players";
  if (selection.scopeDisplayName) return selection.scopeDisplayName;
  const countries = selection.entityCount;
  if (countries === 0) return "Unowned land";
  return `${formatInt(countries)} ${countries === 1 ? "country" : "countries"}`;
}

/**
 * The size of the selection on the Selected line, or null when one entity
 * heads the level, because the entity's own line gives the size. A followed
 * country can have no land on a past date, and the line tells that always.
 */
export function selectedLineCount(selection: SelectionLike): string | null {
  const count = selection.locationCount;
  if (count === 0) return "No land on this date";
  if (selection.activeProfile !== undefined && selection.preset !== "players") return null;
  return `${formatInt(count)} ${count === 1 ? "location" : "locations"}`;
}

/** A name as the owner of what follows: "France's", "Athens'" */
export function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/** What the rows of a mode are at the root, and the order that they have */
const WORLD_HEADINGS: Record<MapMode, string> = {
  political: "Great powers",
  control: "Countries by control",
  development: "Countries by development",
  stateEfficacy: "Countries by effective dev",
  wealth: "Countries by wealth",
  unrealizedTaxBase: "Countries by tax gap",
  population: "Countries by population",
  populationGrowth: "Countries by growth",
  religion: "Religions by followers",
  markets: "Markets by value",
  rgoLevel: "Raw materials by RGO level",
  buildingLevels: "Buildings by levels",
};

/** What a mode's rows are for one country or market. A country mode lists its locations. */
const ENTITY_ROWS: Record<MapMode, string> = {
  political: "great powers",
  control: "locations",
  development: "locations",
  stateEfficacy: "locations",
  wealth: "locations",
  unrealizedTaxBase: "locations",
  population: "locations",
  populationGrowth: "locations",
  religion: "religions",
  markets: "goods",
  rgoLevel: "raw materials",
  buildingLevels: "buildings",
};

/** What one location's caption answers */
const LOCATION_ANSWERS: Record<MapMode, string> = {
  political: "owner",
  control: "control",
  development: "development",
  stateEfficacy: "effective dev",
  wealth: "wealth",
  unrealizedTaxBase: "tax gap",
  population: "population",
  populationGrowth: "growth",
  religion: "religion",
  markets: "market",
  rgoLevel: "RGO level",
  buildingLevels: "buildings",
};

/** The order of a set of countries. The political heading at the root has no "by". */
const SET_BY: Partial<Record<MapMode, string>> = { political: "rank" };

/**
 * The heading of the caption states the subject, what the rows are. It does
 * not state the mode, because the map select directly above names the mode.
 */
export function captionHeading(
  mode: MapMode,
  selection: SelectionLike | null | undefined,
  /** In a multiplayer save the great powers list also holds each human player. */
  multiplayer = false,
): string {
  const world = WORLD_HEADINGS[mode];
  if (selection == null || selection.isEmpty) {
    return mode === "political" && multiplayer ? "Great powers and players" : world;
  }
  const profile = selection.preset === "players" ? undefined : selection.activeProfile;
  if (profile?.kind === "location") {
    return `${possessive(profile.location.name)} ${LOCATION_ANSWERS[mode]}`;
  }
  if (profile?.kind === "market") {
    return `${possessive(profile.market.name)} ${ENTITY_ROWS[mode]}`;
  }
  if (profile?.kind === "country") {
    return `${possessive(profile.country.name)} ${ENTITY_ROWS[mode]}`;
  }
  // A set or an area: its name replaces "Countries" and the order stays.
  return `${selectionName(selection)} by ${SET_BY[mode] ?? world.split(" by ")[1]}`;
}

/** The name of a mode's charts and tables, as the link to them and as their level */
export function insightLabel(mode: string): string {
  return `${mode} data`;
}

/**
 * True if the map scales the mode's colours to the selection. Keep this in
 * step with `MapMode::selection_affects_domain` in eu5app.
 */
export function selectionScalesLegend(mode: MapMode): boolean {
  switch (mode) {
    case "political":
    case "control":
    case "markets":
    case "religion":
      return false;
    default:
      return true;
  }
}

/**
 * The tag to show in a list. The game gives a generated tag (AAA67) to a country
 * that it makes during play, and that tag tells the reader nothing, so the name
 * stands alone. Search still finds the country by that tag.
 */
export function displayTag(tag: string | undefined): string | undefined {
  return tag && !/\d/.test(tag) ? tag : undefined;
}

/**
 * The smallest number of locations that a country needs to stand in a
 * world ranking by a ratio. Without it, a state with one good location
 * leads the ranking.
 */
export const RATIO_FLOOR = 10;

/**
 * Remove the rows under the size floor. A row that `keep` names stays, so
 * the floor never hides the player's own country.
 */
export function applyFloor<T>(
  rows: readonly T[],
  size: (row: T) => number,
  keep: (row: T) => boolean = () => false,
  floor: number = RATIO_FLOOR,
): T[] {
  return rows.filter((row) => size(row) >= floor || keep(row));
}

/** The largest number of columns in the Compare level */
export const COMPARE_MAX = 8;

/**
 * The countries that the Compare level shows: the selected countries in
 * the order of the open mode, then the remaining ones in their own order,
 * at most `max`.
 */
export function compareColumns(
  selected: readonly number[],
  modeOrder: readonly number[],
  max: number = COMPARE_MAX,
): number[] {
  const set = new Set(selected);
  const result: number[] = [];
  for (const idx of [...modeOrder, ...selected]) {
    if (result.length >= max) break;
    if (set.has(idx) && !result.includes(idx)) result.push(idx);
  }
  return result;
}

/**
 * The index of the best value in a row of the Compare level, where the
 * lowest rank is best. A tie or a single value has no best.
 */
export function bestRank(ranks: readonly (number | undefined)[]): number | undefined {
  const known = ranks.filter((r): r is number => r !== undefined);
  if (ranks.length < 2 || known.length === 0) return undefined;
  const best = Math.min(...known);
  return known.filter((r) => r === best).length === 1 ? best : undefined;
}

/**
 * One line that says which country leads a Compare table. `ranks` has one list
 * for each ranked metric, in the order of `names`. A metric with a tied best
 * rank has no leader. Without a leader there is no line.
 */
export function compareFinding(
  names: readonly string[],
  ranks: readonly (readonly (number | undefined)[])[],
): string | null {
  const leads = names.map(() => 0);
  for (const row of ranks) {
    const best = bestRank(row);
    if (best !== undefined) leads[row.indexOf(best)] += 1;
  }
  const most = Math.max(0, ...leads);
  if (most === 0) return null;
  const leaders = names.filter((_, i) => leads[i] === most);
  const of = `${formatInt(most)} of ${formatInt(ranks.length)} ranked metrics`;
  return leaders.length === 1
    ? `${leaders[0]} leads ${of}`
    : `${leaders.slice(0, -1).join(", ")} and ${leaders[leaders.length - 1]} each lead ${of}`;
}

/**
 * One line that says how concentrated a total is: the top tenth of the rows and
 * their share. It needs ten rows or more for a top tenth, and a total above zero.
 */
export function topShareFinding(
  noun: string,
  metric: string,
  values: readonly number[],
): string | null {
  const positive = values.filter((v) => v > 0).sort((a, b) => b - a);
  const total = positive.reduce((sum, v) => sum + v, 0);
  if (values.length < 10 || total <= 0) return null;
  const top = Math.ceil(values.length / 10);
  const held = positive.slice(0, top).reduce((sum, v) => sum + v, 0);
  return `Top 10% of ${noun} hold ${Math.round((held / total) * 100)}% of ${metric}`;
}

/** The rank that counts as near the top in the line of a profile */
const TOP_RANK = 10;

/**
 * One line that says where a country stands among all countries: how many of its
 * ranked metrics are near the top, and its lowest rank. It needs two ranks or more.
 */
export function profileFinding(
  name: string,
  figures: readonly { label: string; rank: number | undefined }[],
): string | null {
  const ranked = figures.filter((f): f is { label: string; rank: number } => f.rank !== undefined);
  if (ranked.length < 2) return null;
  const top = ranked.filter((f) => f.rank <= TOP_RANK).length;
  const lowest = ranked.reduce((a, b) => (b.rank > a.rank ? b : a));
  const lead =
    top > 0
      ? `${name} is in the top ${TOP_RANK} on ${formatInt(top)} of ${formatInt(ranked.length)} ranked metrics`
      : `${name} is outside the top ${TOP_RANK} on each ranked metric`;
  return `${lead}, and lowest on ${lowest.label} (#${formatInt(lowest.rank)})`;
}

/**
 * The bars of one Compare row on one scale, as fractions of the track: `zero` is
 * where zero is, and each bar goes from `left` for `width`. A value under zero goes
 * to the left of the zero line.
 */
export function compareBars(amounts: readonly number[]) {
  const low = Math.min(0, ...amounts);
  const high = Math.max(0, ...amounts);
  const span = high - low;
  const zero = span > 0 ? Math.abs(low) / span : 0;
  return {
    zero,
    bars: amounts.map((amount) => {
      const width = span > 0 ? Math.abs(amount) / span : 0;
      return { left: amount < 0 ? zero - width : zero, width };
    }),
  };
}

/** True if two countries or more share the best rank of a row in the Compare level */
export function bestIsTied(ranks: readonly (number | undefined)[]): boolean {
  const known = ranks.filter((r): r is number => r !== undefined);
  if (known.length < 2) return false;
  const best = Math.min(...known);
  return known.filter((r) => r === best).length > 1;
}

/**
 * Where a rank stands among all countries, from 1 for the first to 0 for the
 * last. A bar of this value compares a country with the world, and it says the
 * same for each metric, also a metric that one giant distorts.
 */
/**
 * Where a rank stands on a track of a cohort, from 0 at the last rank to 1 at the
 * first. The scale is logarithmic, because a reader tells #1 from #5 and does not
 * tell #301 from #305. On a linear track the top ranks stand on one pixel.
 */
export function rankPosition(rank: number, cohort: number): number {
  return cohort > 1 ? 1 - Math.log(Math.max(1, rank)) / Math.log(cohort) : 1;
}

export function percentileOf(rank: number, cohort: number): number {
  return cohort > 1 ? (cohort - rank) / (cohort - 1) : 1;
}
