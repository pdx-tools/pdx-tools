import { formatDay } from "@/features/stack";
import type {
  CountrySummary,
  Hoi4Event,
  Hoi4EventKind,
  Hoi4Overview,
  MapMatch,
  MapMode,
  OccupationSummary,
} from "../worker/types";

export const MODES: { key: MapMode; label: string }[] = [
  { key: "political", label: "Political" },
  { key: "occupation", label: "Occupation" },
  { key: "factions", label: "Factions" },
  { key: "ideology", label: "Ideology" },
];

export const EVENT_KINDS: { key: Hoi4EventKind; label: string; short: string }[] = [
  { key: "war", label: "Wars", short: "War" },
  { key: "capitulation", label: "Capitulations", short: "Capitulation" },
  { key: "faction", label: "Faction joins", short: "Faction" },
  { key: "sinking", label: "Capital ships sunk", short: "Sinking" },
];

/** A level of the stack */
export type Entity =
  | { kind: "country"; tag: string }
  /** A faction by index. -1 is the countries in no faction. */
  | { kind: "faction"; index: number }
  | { kind: "ideology"; key: string }
  | { kind: "occupation"; index: number }
  | { kind: "event"; index: number }
  /** `from` and `to` mark a period that the time bar opened */
  | { kind: "chronology"; tag?: string; from?: string; to?: string }
  | { kind: "playthrough"; tag: string }
  | { kind: "variables"; tag: string }
  | { kind: "countryLedger" }
  | { kind: "occupationLedger" }
  | { kind: "warLedger"; tag?: string }
  | { kind: "memberLedger"; index: number };

export function entityKey(e: Entity): string {
  switch (e.kind) {
    case "country":
    case "playthrough":
    case "variables":
      return `${e.kind}:${e.tag}`;
    case "faction":
    case "occupation":
    case "event":
    case "memberLedger":
      return `${e.kind}:${e.index}`;
    case "ideology":
      return `ideology:${e.key}`;
    case "chronology":
    case "warLedger":
      return `${e.kind}:${e.tag ?? ""}`;
    default:
      return e.kind;
  }
}

export function isWide(e: Entity): boolean {
  return (
    e.kind === "countryLedger" ||
    e.kind === "occupationLedger" ||
    e.kind === "warLedger" ||
    e.kind === "memberLedger"
  );
}

/** The faction row of the countries that are in no faction */
export const NO_FACTION = { name: "Not in a faction", color: "#5e5e5e" };

/** An index over the overview, so that levels can look things up */
export class Hoi4World {
  readonly byTag: Map<string, CountrySummary>;
  /** The occupation index of each occupied state */
  readonly occupationOfState: Map<number, number>;
  readonly landed: CountrySummary[];

  constructor(readonly overview: Hoi4Overview) {
    this.byTag = new Map(overview.countries.map((x) => [x.tag, x]));
    this.occupationOfState = new Map();
    overview.occupations.forEach((o, i) => {
      for (const s of o.states) this.occupationOfState.set(s.id, i);
    });
    this.landed = overview.countries
      .filter((x) => x.statesHeld > 0 || x.statesOwned > 0)
      .sort((a, b) => b.factoriesHeld - a.factoriesHeld);
  }

  name(tag: string): string {
    return this.byTag.get(tag)?.name ?? tag;
  }

  color(tag: string): string | null {
    return this.byTag.get(tag)?.color ?? null;
  }

  ideologyName(key: string | null | undefined): string {
    return this.overview.ideologies.find((x) => x.key === key)?.name ?? key ?? "Unknown";
  }

  ideologyColor(key: string | null | undefined): string | null {
    return this.overview.ideologies.find((x) => x.key === key)?.color ?? null;
  }

  faction(index: number) {
    return index < 0
      ? { ...NO_FACTION, ideology: null, members: [] }
      : this.overview.factions[index];
  }

  /** Countries of a faction (-1: in none), largest industry first */
  factionCountries(index: number): CountrySummary[] {
    return this.landed.filter((x) => (index < 0 ? x.faction == null : x.faction === index));
  }

  ideologyCountries(key: string): CountrySummary[] {
    return this.landed.filter((x) => x.ideology === key);
  }

  factories(countries: CountrySummary[]): number {
    return countries.reduce((sum, x) => sum + x.factoriesHeld, 0);
  }

  /** The share of the world's factories, as a percent string */
  share(factories: number): string {
    const total = this.overview.totalFactories;
    return total ? `${Math.round((factories / total) * 100)}%` : "0%";
  }

  occupationName(o: OccupationSummary): string {
    return `${this.name(o.occupier)} in ${this.name(o.occupied)}`;
  }

  label(e: Entity): string {
    switch (e.kind) {
      case "country":
        return this.name(e.tag);
      case "faction":
        return this.faction(e.index).name;
      case "ideology":
        return this.ideologyName(e.key);
      case "occupation":
        return this.occupationName(this.overview.occupations[e.index]);
      case "event":
        return formatDay(this.overview.events[e.index].date);
      case "chronology":
        return "Chronology";
      case "playthrough":
        return "Playthrough record";
      case "variables":
        return "Save variables";
      case "countryLedger":
        return "Country ledger";
      case "occupationLedger":
        return "Occupation ledger";
      case "warLedger":
        return "War ledger";
      case "memberLedger":
        return "Member ledger";
    }
  }

  /** The land that a level names on the map, or null for none */
  mapMatch(e: Entity): MapMatch | null {
    const countries = (tags: string[]) => ({ countries: tags, states: [] });
    switch (e.kind) {
      case "country":
      case "playthrough":
      case "variables":
        return countries([e.tag]);
      case "chronology":
      case "warLedger":
        return e.tag ? countries([e.tag]) : null;
      case "faction":
      case "memberLedger":
        return countries(this.factionCountries(e.index).map((x) => x.tag));
      case "ideology":
        return countries(this.ideologyCountries(e.key).map((x) => x.tag));
      case "occupation":
        return {
          countries: [],
          states: this.overview.occupations[e.index].states.map((x) => x.id),
        };
      case "event":
        return countries(this.overview.events[e.index].countries);
      default:
        return null;
    }
  }

  /** The countries that a level is about, to brighten their events */
  relatedTags(e: Entity): Set<string> | null {
    if (e.kind === "occupation") {
      const o = this.overview.occupations[e.index];
      return new Set([o.occupier, o.occupied]);
    }
    if (e.kind === "event") {
      return null;
    }
    const match = this.mapMatch(e);
    return match ? new Set(match.countries) : null;
  }

  /** The entity that a province's land stands for in a map mode */
  modeEntity(mode: MapMode, controller: string, stateId: number | null): Entity | null {
    const country = this.byTag.get(controller);
    switch (mode) {
      case "political":
        return { kind: "country", tag: controller };
      case "occupation": {
        const index = stateId === null ? undefined : this.occupationOfState.get(stateId);
        return index === undefined ? null : { kind: "occupation", index };
      }
      case "factions":
        return { kind: "faction", index: country?.faction ?? -1 };
      case "ideology":
        return country?.ideology ? { kind: "ideology", key: country.ideology } : null;
    }
  }

  /** One line for an event */
  describe(event: Hoi4Event): string {
    const [first, ...rest] = event.countries;
    const a = this.name(first);
    switch (event.kind) {
      case "war": {
        const names = rest.map((x) => this.name(x));
        const targets =
          names.length <= 2 ? names.join(" and ") : `${names[0]} and ${names.length - 1} others`;
        return `${a} goes to war with ${targets}`;
      }
      case "capitulation":
        return `${a} capitulates`;
      case "faction":
        return `${a} joins the ${event.detail ?? "faction"}`;
      case "sinking":
        return rest.length
          ? `${a} sinks ${this.name(rest[0])}'s ${event.detail ?? "ship"}`
          : `${event.detail ?? "A capital ship"} is sunk`;
    }
  }
}

/** Large counts as "1.25M" and "57K" */
export function formatCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  return Math.round(n).toLocaleString("en-US");
}

/** "military_governor_occupation" as "Military governor" */
export function lawName(law: string | null | undefined): string {
  if (!law) return "None";
  const words = law.replace(/_occupation$/, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
