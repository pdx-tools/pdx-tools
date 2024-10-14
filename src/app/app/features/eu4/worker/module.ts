import { transfer } from "comlink";
import {
  reduceToTableExpenseLedger,
  reduceToTableLedger,
} from "../utils/budget";
import type {
  CountryCulture,
  CountryExpenses,
  CountryIncome,
  CountryLosses,
  CountryMatcher,
  CountryStateDetails,
  EnhancedCountryInfo,
  HealthData,
  LedgerDatum,
  LocalizedTag,
  MapDate,
  OwnedDevelopmentStates,
  CountryAdvisors,
} from "../types/models";
import { MapPayload, QuickTipPayload } from "../types/map";
import { workLedgerData } from "../utils/ledger";
import { expandLosses } from "../utils/losses";
import { wasm } from "./common";
import {
  ActiveWarParticipant,
  TimelapseIter,
  Wars,
} from "../../../../../wasm-eu4/pkg/wasm_eu4";
import { timeSync } from "@/lib/timeit";
import { logMs } from "@/lib/log";
import {
  filterToRecurringExpenses,
  filterToRecurringIncome,
} from "../features/country-details/data";
import { budgetSelect, createBudget } from "../features/country-details/budget";
export * from "./init";

export const getRawData = wasm.viewData;
export const melt = () => wasm.melt();

let provinceIdToColorIndex = new Uint16Array();

export function eu4SetProvinceIdToColorIndex(
  _provinceIdToColorIndex: Uint16Array,
) {
  provinceIdToColorIndex = _provinceIdToColorIndex;
}

export function eu4GetProvinceIdToColorIndex() {
  return provinceIdToColorIndex;
}

export type MapColors = {
  primary: Uint8Array;
  secondary: Uint8Array;
  country?: Uint8Array;
};

export function eu4MapColors(payload: MapPayload): MapColors {
  const arr = wasm.save.map_colors(payload);
  if (payload.kind == "political") {
    const primary = arr.subarray(0, arr.length / 2);
    const secondary = arr.subarray(arr.length / 2);
    const country = primary;
    return transfer({ primary, secondary, country }, [arr.buffer]);
  } else if (payload.kind == "battles") {
    const primary = arr.subarray(0, arr.length / 3);
    const secondary = arr.subarray(arr.length / 3, (arr.length * 2) / 3);
    const country = arr.subarray((arr.length * 2) / 3);
    return transfer({ primary, secondary, country }, [arr.buffer]);
  } else if (payload.date != null && payload.kind == "religion") {
    const primary = arr.subarray(0, arr.length / 3);
    const secondary = arr.subarray(arr.length / 3, (arr.length * 2) / 3);
    const country = arr.subarray((arr.length * 2) / 3);
    return transfer({ primary, secondary, country }, [arr.buffer]);
  } else {
    const primary = arr.subarray(0, arr.length / 2);
    const secondary = arr.subarray(arr.length / 2);
    return transfer({ primary, secondary }, [arr.buffer]);
  }
}

export type MapTimelapseItem = {
  date: MapDate;
  primary: Uint8Array;
  secondary: Uint8Array;
  country: Uint8Array;
};

let mapCursor: TimelapseIter | undefined;
export function mapTimelapseNext(): MapTimelapseItem | undefined {
  const item = mapCursor?.next();
  if (item === undefined || mapCursor === undefined) {
    mapCursor?.free();
    return undefined;
  }

  const date = item.date();
  const arr = item.data();
  const parts = mapCursor.parts();
  if (parts == 2) {
    const primary = arr.subarray(0, arr.length / parts);
    const secondary = arr.subarray(arr.length / parts);
    const country = primary;
    return transfer({ date, primary, secondary, country }, [arr.buffer]);
  } else if (parts == 3) {
    const primary = arr.subarray(0, arr.length / parts);
    const secondary = arr.subarray(
      arr.length / parts,
      (arr.length * 2) / parts,
    );
    const country = arr.subarray((arr.length * 2) / parts);
    return transfer({ date, primary, secondary, country }, [arr.buffer]);
  } else {
    throw new Error("unexpected parts");
  }
}

export function mapTimelapse(payload: {
  kind: "political" | "religion" | "battles";
  interval: "year" | "month" | "week" | "day";
  start: number | undefined;
}) {
  mapCursor = wasm.save.map_cursor(payload);
}

export function eu4GetCountries(): EnhancedCountryInfo[] {
  const countries = wasm.save.get_countries();

  // name with accents and diacritics removed (eg: Lübeck -> Lubeck)
  // https://stackoverflow.com/a/37511463/433785
  return countries.map((x) => ({
    ...x,
    normalizedName: x.name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  }));
}

export type CountryDetails = ReturnType<typeof eu4GetCountry>;
function activeWarParticipant({
  participant: { losses, ...participant },
  armedForces,
  income,
  expenses,
  ...rest
}: ActiveWarParticipant) {
  return {
    ...rest,
    budget: createBudget({ income, expenses }),
    losses: expandLosses(losses),
    ...armedForces,
    ...participant,
  };
}

export function eu4GetCountry(tag: string) {
  const result = wasm.save.get_country(tag);
  return {
    ...result,
    ...result.armed_forces,
    active_wars: result.active_wars.map((war) => ({
      ...war,
      attackers: war.attackers.map(activeWarParticipant),
      defenders: war.defenders.map(activeWarParticipant),
    })),
  };
}

export function eu4GetCountryRulers(tag: string) {
  return wasm.save.get_country_rulers(tag);
}

export function eu4GetCountryAdvisors(tag: string): CountryAdvisors {
  return wasm.save.get_country_advisors(tag);
}

export function eu4GetCountryProvinceReligion(tag: string) {
  return wasm.save.get_country_province_religion(tag);
}

export function eu4GetCountrymana(tag: string) {
  return wasm.save.get_country_mana(tag);
}

export function eu4GetCountryHistory(tag: string) {
  const timed = timeSync(() => wasm.save.get_country_history(tag));
  logMs(timed, "country history calculation");
  return timed.data;
}

export function eu4GetCountryInstitutionPush(
  tag: string,
  countryDevelopmentModifier: number,
  expandInfrastructureCost: number,
  overrides: Map<number, number>,
) {
  const timed = timeSync(() =>
    wasm.save.get_country_institutions(
      tag,
      countryDevelopmentModifier,
      expandInfrastructureCost,
      overrides,
    ),
  );
  logMs(timed, "country institution push calculation");
  return timed.data;
}

export function eu4GetCountryProvinceCulture(tag: string): CountryCulture[] {
  return wasm.save.get_country_province_culture(tag);
}

export function eu4GetCountryLeaders(tag: string) {
  return wasm.save.get_country_leaders(tag);
}

export function eu4GetCountryStates(tag: string): CountryStateDetails[] {
  return wasm.save.get_country_states(tag);
}

export function eu4GetCountryEstates(tag: string) {
  return wasm.save.get_country_estates(tag);
}

export function eu4InitialMapPosition(): [number, number] {
  const result = wasm.save.initial_map_position();
  return [result[0], result[1]];
}

export function eu4MapPositionOf(tag: string): [number, number] {
  const result = wasm.save.map_position_of_tag(tag);
  return [result[0], result[1]];
}

export function eu4GetPlayerHistories() {
  return wasm.save.get_player_histories();
}

export function eu4GetLuckyCountries(): LocalizedTag[] {
  return wasm.save.get_lucky_countries();
}

export function eu4GetGreatPowers() {
  return wasm.save.get_great_powers();
}

export function eu4MatchingCountries(matcher: CountryMatcher): LocalizedTag[] {
  return wasm.save.matching_countries(matcher);
}

export function eu4GetNationIdeaGroups(matcher: CountryMatcher) {
  return wasm.save.get_nation_idea_groups(matcher);
}

export function eu4GetAnnualIncomeData(filter: CountryMatcher): LedgerDatum[] {
  const data = wasm.save.get_annual_income_ledger(filter);
  return workLedgerData(data);
}

export function eu4GetAnnualNationSizeData(
  filter: CountryMatcher,
): LedgerDatum[] {
  const data = wasm.save.get_annual_nation_size_ledger(filter);
  return workLedgerData(data);
}

export function eu4GetAnnualScoreData(filter: CountryMatcher): LedgerDatum[] {
  const data = wasm.save.get_annual_score_ledger(filter);
  return workLedgerData(data);
}

export function eu4GetAnnualInflationData(
  filter: CountryMatcher,
): LedgerDatum[] {
  const data = wasm.save.get_annual_inflation_ledger(filter);
  return workLedgerData(data);
}

export function eu4GetDevEfficiencies(filter: CountryMatcher) {
  return wasm.save.get_dev_efficiency(filter);
}

export function eu4GetProvinces() {
  return wasm.save.get_provinces();
}

export function eu4GetHealth(filter: CountryMatcher): HealthData {
  return wasm.save.get_health(filter);
}

export function eu4GetCountriesIncome(
  filter: CountryMatcher,
  percent: boolean,
  recurringOnly: boolean,
): CountryIncome[] {
  const data = wasm.save.get_countries_income(filter);
  return reduceToTableLedger(data, percent, recurringOnly);
}

export function eu4GetCountriesExpenses(
  filter: CountryMatcher,
  percent: boolean,
  recurringOnly: boolean,
): CountryExpenses[] {
  const data = wasm.save.get_countries_expenses(filter);
  return reduceToTableExpenseLedger(data, percent, recurringOnly);
}

export function eu4GetCountriesTotalExpenses(
  filter: CountryMatcher,
  percent: boolean,
  recurringOnly: boolean,
): CountryExpenses[] {
  const data = wasm.save.get_countries_total_expenses(filter);
  return reduceToTableExpenseLedger(data, percent, recurringOnly);
}

export function eu4GeographicalDevelopment(filter: CountryMatcher) {
  return wasm.save.geographical_development(filter);
}

export function eu4OwnedDevelopmentStates(
  filter: CountryMatcher,
): OwnedDevelopmentStates[] {
  return wasm.save.owned_development_states(filter);
}

export function eu4GetCountriesWarLosses(
  filter: CountryMatcher,
): CountryLosses[] {
  const result = wasm.save.countries_war_losses(filter);

  return result.map(({ losses, ...rest }) => {
    return {
      ...rest,
      ...expandLosses(losses),
    };
  });
}

export type SingleCountryWarCasualties = ReturnType<
  typeof eu4GetSingleCountryCasualties
>[number];
export function eu4GetSingleCountryCasualties(tag: string) {
  const raw = wasm.save.get_country_casualties(tag);
  return raw.map((x) => ({
    ...x,
    losses: expandLosses(x.losses),
  }));
}

function sumLosses(participants: Wars[number]["attackers"]["members"]) {
  const result: number[] = [];
  for (const member of participants) {
    for (let i = 0; i < member.losses.length; i++) {
      result[i] = (result?.[i] ?? 0) + member.losses[i];
    }
  }
  return expandLosses(result);
}

export type War = ReturnType<typeof eu4GetWars>[number];
export type WarSide = War["attackers"];
export function eu4GetWars(filter: CountryMatcher) {
  const data = wasm.save.wars(filter);
  return data.map((x) => {
    const aLosses = sumLosses(x.attackers.members);
    const dLosses = sumLosses(x.defenders.members);
    return {
      ...x,
      totalBattleLosses: aLosses.totalBattle + dLosses.totalBattle,
      totalAttritionLosses: aLosses.totalAttrition + dLosses.totalAttrition,
      attackers: {
        ...x.attackers,
        losses: aLosses,
      },
      defenders: {
        ...x.defenders,
        losses: dLosses,
      },
    };
  });
}

export type WarInfo = ReturnType<typeof eu4GetWarInfo>;
export type BattleInfo = WarInfo["battles"][number];
export type WarParticipant = WarInfo["attackerParticipants"][number];
export function eu4GetWarInfo(war: string) {
  const raw = wasm.save.get_war(war);
  if (!raw) {
    throw new Error(`Did not find war by the name of ${war}`);
  }
  return {
    ...raw,
    attackerParticipants: raw.attackers.members.map((x) => ({
      ...x,
      losses: expandLosses(x.losses),
    })),
    defenderParticipants: raw.defenders.members.map((x) => ({
      ...x,
      losses: expandLosses(x.losses),
    })),
  };
}

export type MonitorData = ReturnType<typeof eu4MonitoringData>;
export function eu4MonitoringData() {
  const result = wasm.save.monitoring_data();
  return {
    ...result,
    countries: result.countries.map(({ armed_forces, ...rest }) => ({
      ...rest,
      ...armed_forces,
    })),
  };
}

export function eu4DateToDays(s: string) {
  return wasm.save.date_to_days(s);
}

export function eu4DaysToDate(s: number) {
  return wasm.save.days_to_date(s);
}

export function eu4GetProvinceDeteails(id: number) {
  return wasm.save.get_province_details(id);
}

export function eu4GetMapTooltip(
  province: number,
  payload: MapPayload["kind"],
  date: number | undefined,
): QuickTipPayload | null {
  return wasm.save.map_quick_tip(province, payload, date) ?? null;
}
