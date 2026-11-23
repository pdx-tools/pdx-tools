import type { ManaFigure, ManaType, ManaUse } from "@/wasm/wasm_eu4";
import { formatInt } from "@/lib/format";
import { DAYS_PER_YEAR, formatLongDate } from "@/features/timeline/date";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { valueOf } from "./history";
import type { CampaignRow } from "./model";
import type { ManaOption } from "./figures";

export const MANA_TYPES = ["adm", "dip", "mil"] as const satisfies readonly ManaType[];
/** The uses in stack order, from the bottom, as the save groups are numbered. */
export const MANA_USES = [
  "tech",
  "ideas",
  "stability",
  "develop",
  "cores",
  "peace",
  "leaders",
  "other",
] as const satisfies readonly ManaUse[];

export const typeName: Record<ManaType, string> = {
  adm: "Admin",
  dip: "Diplomatic",
  mil: "Military",
};
/** Short labels, for legends and tables. */
export const useName: Record<ManaUse, string> = {
  tech: "Tech",
  ideas: "Ideas",
  stability: "Stability",
  develop: "Develop",
  cores: "Cores",
  peace: "Peace & war exhaustion",
  leaders: "Leaders & army",
  other: "Other",
};
/** Full names, for the use menu, Help, hovers and the CSV. */
export const useFullName: Record<ManaUse, string> = {
  tech: "Technology",
  ideas: "Ideas",
  stability: "Stability",
  develop: "Develop provinces",
  cores: "Core provinces",
  peace: "Peace terms and war exhaustion",
  leaders: "Leaders, army and fleet actions",
  other: "Other",
};
/** A use in a note, after "spent on": "no admin mana spent on technology". */
export const useSentence: Record<ManaUse, string> = {
  tech: "technology",
  ideas: "ideas",
  stability: "stability",
  develop: "developing provinces",
  cores: "coring provinces",
  peace: "peace terms and war exhaustion",
  leaders: "leaders, army and fleet actions",
  other: "other actions",
};
/**
 * Seven hues and a grey for Other, where every pair, not only neighbors in
 * the stack, stays apart for protanopia, deuteranopia and tritanopia, and
 * passes 3:1 against the sheet. Dark mode holds two of them a step darker.
 */
const useColors: Record<"light" | "dark", Record<ManaUse, string>> = {
  light: {
    tech: "#205aec",
    ideas: "#f9570e",
    stability: "#983ab7",
    develop: "#19a154",
    cores: "#ab4607",
    peace: "#d274a6",
    leaders: "#9181fc",
    other: "#636972",
  },
  dark: {
    tech: "#205aec",
    ideas: "#f9570e",
    stability: "#983ab7",
    develop: "#19a154",
    cores: "#ab4607",
    peace: "#cf71a3",
    leaders: "#8a7af4",
    other: "#636972",
  },
};

/** The use colors for the sheet's theme. */
export const manaUseColors = (dark: boolean) => useColors[dark ? "dark" : "light"];

/** The view choices of the Mana family, kept while the reader moves between figures. */
export type ManaView = {
  /** Which types By use and By country add up. */
  types: "all" | ManaType;
  /** The use that By country plots. */
  use: "all" | ManaUse;
  /** The pool that Banked plots. */
  pool: ManaType;
};
export const DEFAULT_MANA_VIEW: ManaView = { types: "all", use: "all", pool: "adm" };

export const chosenTypes = (view: ManaView): ManaType[] =>
  view.types === "all" ? [...MANA_TYPES] : [view.types];

/** The query figure of By country or Banked. */
export function manaFigure(option: Exclude<ManaOption, "use">, view: ManaView): ManaFigure {
  return option === "banked"
    ? { kind: "pool", type: view.pool }
    : {
        kind: "spent",
        types: chosenTypes(view),
        uses: view.use === "all" ? [...MANA_USES] : [view.use],
      };
}

/** What was spent, in a sentence: "mana" for all types, or "admin mana". */
export const spentText = (view: Pick<ManaView, "types">) =>
  view.types === "all" ? "mana" : `${typeName[view.types].toLowerCase()} mana`;

/** The types in a table head: "all mana", or "admin". */
export const typesText = (view: ManaView) =>
  view.types === "all" ? "all mana" : typeName[view.types].toLowerCase();

/**
 * The save that "since" counts from: the first save of the watched session,
 * if the selected save is after it, else the save before the selected one.
 */
export type Baseline = { column: number };

export function baselineOf(selected: number, watchStart: number): Baseline | null {
  if (selected <= 0) return null;
  return { column: watchStart >= 0 && watchStart < selected ? watchStart : selected - 1 };
}

/** A since column's head, which names its baseline: "since watching", "since 1526 Mar 1". */
export function sinceHead(
  columns: readonly AnalysisSave[],
  baseline: Baseline,
  watchStart: number,
): string {
  return baseline.column === watchStart
    ? "since watching"
    : `since ${formatLongDate(columns[baseline.column].date)}`;
}

/** A span of days in words: "110 days", "1 year", "2.7 years". The game's years have 365 days. */
export function yearsText(days: number) {
  if (days < DAYS_PER_YEAR) return `${days} ${days === 1 ? "day" : "days"}`;
  const text = (days / DAYS_PER_YEAR).toLocaleString("en-US", { maximumFractionDigits: 1 });
  return text === "1" ? "1 year" : `${text} years`;
}

/** A change written with its sign, as the since columns show it: "+104", "0". */
export const signed = (value: number) => (value > 0 ? `+${formatInt(value)}` : formatInt(value));

/** The share of each use in a total, 0 when nothing was spent. */
export function shares(uses: readonly number[]): number[] {
  const total = uses.reduce((a, b) => a + b, 0);
  return uses.map((x) => (total > 0 ? x / total : 0));
}

/** "34%": a share in whole percent. */
export const percent = (share: number) => `${Math.round(share * 100)}%`;

/** "A", "A and B", "A, B and C". */
export function listText(items: readonly string[]) {
  return items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Why a country without spend on the view's choice has no row. */
export function nothingText(view: ManaView, names: readonly string[]) {
  if (view.types === "all" && view.use === "all") return `${listText(names)}: nothing spent`;
  const on = view.use === "all" ? "" : ` on ${useSentence[view.use]}`;
  return `${listText(names)}: no ${spentText(view)} spent${on}`;
}

/** The chart's tags that no lineage of the answer holds: no save carries their mana. */
export function notCarried(
  answer: readonly { lineage: { tags: readonly { tag: string }[] } }[] | null,
  tags: readonly string[] | null,
): string[] {
  if (!answer || !tags) return [];
  const carried = new Set(answer.flatMap((x) => x.lineage.tags.map((held) => held.tag)));
  return tags.filter((tag) => !carried.has(tag));
}

/** Why a country of the chart has no mana figures at all. */
export const notCarriedText = (names: readonly string[]) => `${listText(names)}: no mana figures`;

/**
 * True while something can still give a mana view its figures: the chart's
 * countries load, the query runs, or the campaign reads saves and none has
 * given a result yet. A stopped, failed or full campaign is not reading.
 */
export const manaReading = (state: {
  countriesLoading: boolean;
  queryLoading: boolean;
  campaignReading: boolean;
  hasResult: boolean;
}) => state.countriesLoading || state.queryLoading || (state.campaignReading && !state.hasResult);

/**
 * What a mana view says when it has no rows: still reading, every country of
 * the chart spent nothing on the choice, or none is carried. Without a
 * result and nothing reading, such as after a stop, it says nothing: the band
 * above says why.
 */
export function emptyText({
  reading,
  failed,
  hasResult,
  allSpentNothing,
  view,
}: {
  reading: boolean;
  failed: boolean;
  hasResult: boolean;
  /** Every country of the chart has figures, all of them zero on the choice. */
  allSpentNothing: boolean;
  view: ManaView;
}): string | null {
  if (failed) return null;
  if (reading) return "Reading the mana figures of the chart's countries.";
  if (!hasResult) return null;
  if (allSpentNothing) {
    const on = view.use === "all" ? "" : ` on ${useSentence[view.use]}`;
    return `No country of the chart spent ${spentText(view)}${on}.`;
  }
  return "No mana figures for the chart's countries.";
}

/**
 * The rows that spent nothing on the choice, which are not rows of the chart.
 * The followed country stays drawn even at zero, as it is emphasized at rest,
 * unless every country is at zero.
 */
export function spentNothing(rows: readonly CampaignRow[], followed: string | null): CampaignRow[] {
  const none = rows.filter((row) => !row.cells.some((cell) => (valueOf(cell) ?? 0) > 0));
  // When nobody spent anything there is no chart, and the empty sentence says so.
  return none.length === rows.length ? none : none.filter((row) => row.key !== followed);
}
