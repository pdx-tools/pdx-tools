import type { ActiveProfileIdentity, MapMode } from "@/wasm/wasm_eu5";
import { formatCount, formatFloat, formatInt } from "@/lib/format";

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
  rgoLevel: "Countries by RGO levels",
  buildingLevels: "Countries by building levels",
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

/** The modes whose rows are not countries, and how those rows belong to a scope */
const CATEGORY_ROWS: Partial<Record<MapMode, { noun: string; link: (land: string) => string }>> = {
  religion: { noun: "Religions", link: (land) => `on ${land}` },
  markets: { noun: "Markets", link: (land) => `centred on ${land}` },
};

/** True if the rows of a mode are not countries */
export const isCategoryRows = (mode: MapMode) => CATEGORY_ROWS[mode] !== undefined;

/** The land of a selection, as words for a qualifier */
export function scopeLand(selection: SelectionLike): string {
  return selection.preset === "players" ? "player land" : `the land of ${selectionName(selection)}`;
}

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
  if (profile?.kind === "location") return profile.location.name;
  if (profile?.kind === "market") {
    return `${possessive(profile.market.name)} ${ENTITY_ROWS[mode]}`;
  }
  if (profile?.kind === "country") {
    return `${possessive(profile.country.name)} ${ENTITY_ROWS[mode]}`;
  }
  const by = SET_BY[mode] ?? world.split(" by ")[1];
  // The rows of these modes are not countries, so the scope is a qualifier of the rows.
  const rows = CATEGORY_ROWS[mode];
  if (rows) return `${rows.noun} ${rows.link(scopeLand(selection))}, by ${by}`;
  // A set or an area: its name replaces "Countries" and the order stays.
  return `${selectionName(selection)} by ${by}`;
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
 * The tag to show in a list. A tag of the game has three characters. The game gives
 * a generated tag (AAA67) to a country that it makes during play, and script
 * gives longer tags (SAR_p). Those tell the reader nothing, so the name stands
 * alone. Search still finds the country by its tag.
 */
export function displayTag(tag: string | undefined): string | undefined {
  return tag && /^[A-Z][A-Z0-9]{2}$/.test(tag) ? tag : undefined;
}

/**
 * The name of a campaign as a reader says it. The game ends a default name with
 * a hash of the campaign ("Serbia #166b3650"), which means nothing to a reader.
 */
export function campaignName(playthroughName: string): string {
  return playthroughName.replace(/\s*#[0-9a-f]{8}$/i, "");
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

/** The most countries that fit as columns. A larger set is a table with a row for each. */
export const COMPARE_MAX = 6;

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

/** One country and its value on a metric, for the lines that say who leads */
export type MetricEntry = { name: string; value: number; shown: string };

/**
 * What a table of countries says first: who leads on the main metric and by how
 * much. If one country has both the top and the bottom place on two other
 * metrics, that follows, because it is the story in the table.
 */
export function standingsFinding(
  metric: string,
  entries: readonly MetricEntry[],
  others: readonly { label: string; entries: readonly MetricEntry[] }[] = [],
): string | null {
  const ordered = [...entries].sort((a, b) => b.value - a.value);
  if (ordered.length < 2) return null;
  const [first, second] = ordered;
  // Equal figures name no leader, also when more digits in the save would split them.
  const lead =
    first.shown === second.shown
      ? `${first.name} and ${second.name} share the lead on ${metric}, with ${first.shown}.`
      : `${first.name} leads on ${metric} with ${first.shown}, ahead of ${second.name} with ${second.shown}.`;
  const edges = others.flatMap(({ label, entries: row }) => {
    const sorted = [...row].sort((a, b) => b.value - a.value);
    // A place that others share is no story: many countries can have no ships.
    const last = sorted.length - 1;
    if (sorted.length < 3 || sorted[0].shown === sorted[1].shown) return [];
    if (sorted[last].shown === sorted[last - 1].shown) return [];
    return [{ label, top: sorted[0].name, bottom: sorted[last].name }];
  });
  for (const high of edges) {
    const low = edges.find((x) => x !== high && x.bottom === high.top);
    if (low) return `${lead} ${high.top} has the top ${high.label} and the lowest ${low.label}.`;
  }
  return lead;
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

/**
 * The same claim for a scope, which is not "the world's top tenth": the rows by name.
 * Three is few enough to read, and it is no percentile of a small set.
 */
export function namedShareFinding(
  rows: readonly { name: string; value: number }[],
  metric: string,
  land: string,
): string | null {
  const positive = rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  if (positive.length < 4 || total <= 0) return null;
  const top = positive.slice(0, 3);
  const held = top.reduce((sum, row) => sum + row.value, 0);
  return `${listWords(top.map((row) => row.name))} hold ${Math.round((held / total) * 100)}% of ${metric} on ${land}`;
}

/**
 * The place of each value in a column, largest first. Equal values share a place, and
 * `tied` says how many have it.
 */
export function columnPlaces(values: readonly number[]): { place: number; tied: number }[] {
  const count = new Map<number, number>();
  for (const value of values) count.set(value, (count.get(value) ?? 0) + 1);
  return values.map((value) => ({
    place: values.filter((other) => other > value).length + 1,
    tied: count.get(value) ?? 1,
  }));
}

function listWords(words: readonly string[]) {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** A list of metrics stops at this length, because a longer one is a table. */
const DRIVERS_LISTED = 4;

/**
 * Why the leader leads, as far as the save says: where it stands among the rows on the
 * other metrics, and its lowest place. A place that many rows share says nothing.
 */
export function leaderDrivers(
  name: string,
  places: readonly { label: string; place: number; tied: number }[],
  of: number,
): string | null {
  const clear = places.filter((x) => x.tied <= Math.max(1, of / 4));
  const firsts = clear.filter((x) => x.place === 1).map((x) => x.label);
  const seconds = clear.filter((x) => x.place === 2).map((x) => x.label);
  const lowest = [...clear].sort((a, b) => b.place - a.place)[0];
  const parts: string[] = [];
  if (firsts.length > 0) {
    parts.push(`#1 of ${formatInt(of)} on ${listWords(firsts.slice(0, DRIVERS_LISTED))}`);
  }
  if (seconds.length > 0 && firsts.length < DRIVERS_LISTED) {
    const room = DRIVERS_LISTED - firsts.length;
    parts.push(`#2 on ${listWords(seconds.slice(0, room))}`);
  }
  if (parts.length === 0) return null;
  const low =
    lowest && lowest.place > 2 ? ` Lowest: #${formatInt(lowest.place)}, ${lowest.label}.` : "";
  return `${name} is ${parts.join(", ")}.${low}`;
}

/** The rank that counts as near the top in the line of a profile */
const TOP_RANK = 10;

/**
 * A shared rank says little when many countries share it: 461 countries can sit
 * at the cap of a metric, and each of them is "#1". Such a rank does not count
 * in the line of a profile.
 */
export const MASS_TIE = 10;

/** A rank as a reader must take it: "=#1" when other countries share it */
/** Only the leading countries hold points in the save. A dash says that this one has none. */
export const formatScore = (points: number) => (points > 0 ? formatCount(points) : "\u2014");

/**
 * The values of one column as they read. Different values that would read the same get
 * more digits, so a rank never seems to split equal figures. Equal values stay equal.
 */
export function distinctInColumn(amounts: readonly number[], shown: readonly string[]): string[] {
  const MOST_DECIMALS = 3;
  return shown.map((text, i) => {
    const others = amounts.filter((amount, j) => shown[j] === text && amount !== amounts[i]);
    if (others.length === 0) return text;
    for (let decimals = 1; decimals <= MOST_DECIMALS; decimals += 1) {
      const own = formatFloat(amounts[i], decimals);
      if (others.every((other) => formatFloat(other, decimals) !== own)) return own;
    }
    return formatFloat(amounts[i], MOST_DECIMALS);
  });
}

/**
 * One line for a location: its place in its country and in the world on what the map
 * shows. A rank that others share has its tie mark.
 */
export function locationFinding(
  name: string,
  owner: string | undefined,
  metric: string,
  rank: { world: number; worldTied: number; country: number; countryTied: number },
  counts: { world: number; country: number },
): string {
  const world = `${rankLabel(rank.world, rank.worldTied)} of ${formatInt(counts.world)} in the world`;
  if (!owner) return `${name} is ${world} by ${metric}.`;
  return `${name} is ${rankLabel(rank.country, rank.countryTied)} of ${formatInt(counts.country)} in ${owner} by ${metric}, ${world}.`;
}

export type LeadChart = "land" | "taxBase" | "population" | null;

/**
 * The chart that goes with what the map shows. The save has land, tax base and population
 * by year. Another mode has no record by year, so it has no lead chart.
 */
export function leadChartOf(mode: MapMode, hasLandHistory: boolean): LeadChart {
  if (mode === "population" || mode === "populationGrowth") return "population";
  if (mode === "political") return hasLandHistory ? "land" : "taxBase";
  return null;
}

/** One line for a lens: who holds the most of a thing, or that two hold the same */
export function lensFinding(
  item: string,
  unit: string,
  rows: readonly { name: string; shown: string; value: number }[],
  who: string,
): string | null {
  const [first, second] = rows;
  if (!first) return `No ${who} in this scope hold ${item}.`;
  if (second?.shown === first.shown) {
    return `${first.name} and ${second.name} hold the most ${item}, ${first.shown} ${unit}.`;
  }
  return `${first.name} holds the most ${item}, ${first.shown} ${unit}${second ? `, ahead of ${second.name} with ${second.shown}` : ""}.`;
}

/**
 * The part of a long view that the reader is at: the last one whose top has passed a line
 * near the top of the scroller. At the end of the scroll it is the last part, because a
 * short last part cannot reach the line.
 */
export function currentJump(
  parts: readonly { name: string; top: number }[],
  line: number,
  atEnd: boolean,
): string | undefined {
  if (atEnd) return parts.at(-1)?.name;
  return parts.filter((part) => part.top <= line).at(-1)?.name ?? parts[0]?.name;
}

/** A count with its noun in the right number */
export const countOf = (count: number, one: string, many = `${one}s`) =>
  `${formatInt(count)} ${count === 1 ? one : many}`;

export function rankLabel(rank: number, tied = 1): string {
  return `${tied > 1 ? "=" : ""}#${formatInt(rank)}`;
}

/**
 * One line that says where a country stands among all countries: how many of its
 * ranked metrics are near the top, and its weakest rank out of how many. It needs
 * two ranks or more.
 */
export function profileFinding(
  name: string,
  figures: readonly { label: string; rank: number | undefined; tied?: number }[],
  cohort: number,
): string | null {
  // One total for each country. A place that hundreds share is no place near the top, and
  // it is not a weakness either, so it counts in the total only.
  const all = figures.filter((f) => f.rank !== undefined);
  const ranked = all.filter(
    (f): f is { label: string; rank: number; tied?: number } => (f.tied ?? 1) <= MASS_TIE,
  );
  if (ranked.length < 2) return null;
  const top = ranked.filter((f) => f.rank <= TOP_RANK).length;
  const weakest = ranked.reduce((a, b) => (b.rank > a.rank ? b : a));
  const shared = all.filter((f) => (f.tied ?? 1) > MASS_TIE && (f.rank ?? 0) <= TOP_RANK);
  const lead =
    top > 0
      ? `${name} is top ${TOP_RANK} on ${formatInt(top)} of ${formatInt(all.length)} metrics`
      : `${name} is outside the top ${TOP_RANK} on each metric`;
  const left =
    shared.length > 0
      ? `, not counting ${listWords(shared.map((f) => f.label))}, where hundreds tie`
      : "";
  const of = weakest.rank <= cohort ? ` of ${formatInt(cohort)}` : "";
  return `${lead}${left}. Weakest: ${weakest.label}, #${formatInt(weakest.rank)}${of}.`;
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

type LandPointLike = { year: number; locations: number };
type LandChangeLike = { year: number; change: number };

/** One step of a country's story: a year, and what the save says about it */
export type StoryChapter = { year: number; text: string };

/**
 * The story of a country, computed from the ownership history of the save: its start,
 * its largest gain and loss, its peak, and where it is now. A year that two
 * chapters share has one chapter with both sentences.
 */
export function landChapters(history: {
  points: readonly LandPointLike[];
  peak: LandPointLike;
  biggestGain?: LandChangeLike | null;
  biggestLoss?: LandChangeLike | null;
}): StoryChapter[] {
  const first = history.points.find((p) => p.locations > 0);
  const last = history.points[history.points.length - 1];
  if (!first || !last) return [];
  const raw: StoryChapter[] = [
    { year: first.year, text: `Holds ${countOf(first.locations, "location")}.` },
  ];
  if (history.biggestGain) {
    raw.push({
      year: history.biggestGain.year,
      text: `Largest gain: +${countOf(history.biggestGain.change, "location")}.`,
    });
  }
  if (history.biggestLoss) {
    raw.push({
      year: history.biggestLoss.year,
      text: `Largest loss: \u2212${countOf(-history.biggestLoss.change, "location")}.`,
    });
  }
  raw.push({
    year: history.peak.year,
    text: `Peak: ${countOf(history.peak.locations, "location")}.`,
  });
  if (last.year !== history.peak.year) {
    raw.push({ year: last.year, text: `Now ${countOf(last.locations, "location")}.` });
  }
  const byYear = new Map<number, string[]>();
  for (const chapter of raw)
    byYear.set(chapter.year, [...(byYear.get(chapter.year) ?? []), chapter.text]);
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, texts]) => ({ year, text: texts.join(" ") }));
}

/**
 * Where a country stands in its group on each figure: the figures that it leads, and
 * those where it is last. Null without a clear place, or for a group under three.
 */
export function peerFinding(
  size: number,
  figures: readonly { label: string; place: number }[],
): string | null {
  if (size < 3) return null;
  const top = figures.filter((f) => f.place === 1).map((f) => f.label);
  const bottom = figures.filter((f) => f.place === size).map((f) => f.label);
  const best = figures.reduce<{ label: string; place: number } | null>(
    (a, b) => (a === null || b.place < a.place ? b : a),
    null,
  );
  const parts = [
    top.length > 0
      ? `#1 on ${top.slice(0, 3).join(", ")}`
      : best
        ? `best: #${best.place} on ${best.label}`
        : null,
    bottom.length > 0 ? `last on ${bottom.slice(0, 3).join(", ")}` : null,
  ].filter((x) => x !== null);
  return parts.length > 0 ? `Among the ${formatInt(size)} players: ${parts.join(", ")}.` : null;
}

/** What a figure's title reads from. Each field is true of what the map shows now. */
export type FigureFacts = {
  /** A past date, as text, when the map shows one */
  pastDate?: string;
  /** The selected entity */
  entity?: { kind: "country" | "location" | "market"; name: string; owner?: string };
  /** The land of the entity on the past date */
  datedLand?: { locations: number; rank: number; countryCount: number };
  /** The rank of a selected country on what the map shows */
  entityRank?: { rank: number; of: number; label: string };
  /** The size of a selected set. `land` is set when the rows are not countries. */
  set?: { name: string; land?: string };
  /** The first row of the list of the mode */
  leader?: {
    name: string;
    shown: string;
    metric: string;
    /** The next row, when it reads the same */
    tiedWith?: string;
    /** The sentence for a metric where more is not better, or where "leads" does not fit */
    largest?: boolean;
    /** The list has a total for each country, and the map a value for each location */
    mapMeasure?: string;
  };
};

/**
 * The title of the map as a figure: one sentence that says what it shows, computed
 * from the same data as the panel. The image of the map carries the same sentence.
 */
export function figureTitle(facts: FigureFacts, modeLabel: string): string {
  const { entity, pastDate, datedLand, entityRank, set, leader } = facts;
  if (pastDate) {
    if (entity?.kind === "country" && datedLand) {
      return datedLand.locations > 0
        ? `${entity.name} on ${pastDate}: ${formatInt(datedLand.locations)}\u00a0${datedLand.locations === 1 ? "location" : "locations"}, #${formatInt(datedLand.rank)} of ${formatInt(datedLand.countryCount)} by land`
        : `${entity.name} holds no land on ${pastDate}`;
    }
    return `The world on ${pastDate}`;
  }
  if (entity?.kind === "location") {
    return entity.owner ? `${entity.name}, in ${entity.owner}` : entity.name;
  }
  if (entity?.kind === "market") return `${entity.name}: ${modeLabel}`;
  if (entity) {
    return entityRank
      ? `${entity.name}: #${formatInt(entityRank.rank)} of ${formatInt(entityRank.of)} on ${entityRank.label}`
      : `${entity.name}: ${modeLabel}`;
  }
  if (leader) {
    const scope = set ? (set.land ? `On ${set.land}: ` : `${set.name}: `) : "";
    const where = set ? "" : " the world";
    // One measure per screen: a total in the list and a value per location on the map are two.
    const map = leader.mapMeasure ? `. Map: ${leader.mapMeasure}` : "";
    if (leader.tiedWith) {
      return `${scope}${leader.name} and ${leader.tiedWith} share the lead on ${leader.metric}, ${leader.shown}${map}`;
    }
    // This sentence has its own colon, so a scope stands before it with a full stop.
    const before = set ? `${set.name}. ` : "";
    if (leader.largest) {
      return `${before}Largest ${leader.metric}: ${leader.name}, ${leader.shown}${map}`;
    }
    if (leader.mapMeasure) {
      return `${before}Most ${leader.metric}: ${leader.name}, ${leader.shown}${map}`;
    }
    return `${scope}${leader.name} leads${where} on ${leader.metric}, ${leader.shown}`;
  }
  return modeLabel;
}

/** The size of a set of countries from which a table of each country is too heavy */
export const STANDINGS_MAX = 40;
