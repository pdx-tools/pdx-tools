import { transfer } from "comlink";
import * as wasmModule from "../../../../../../wasm-eu4/pkg/wasm_eu4";
import {
  reduceToTableExpenseLedger,
  reduceToTableLedger,
} from "../../../eu4/utils/budget";
import type {
  CountryDetails,
  CountryExpenses,
  CountryIncome,
  CountryInfo,
  CountryLosses,
  CountryLossesRaw,
  CountryMatcher,
  CountryReligion,
  EnhancedCountryInfo,
  EnhancedMeta,
  GreatAdvisor,
  HealthData,
  IdeaGroup,
  LedgerDatum,
  LocalizedCountryExpense,
  LocalizedCountryIncome,
  LocalizedTag,
  PlayerHistory,
  ProvinceDetails,
  RawWarInfo,
  RunningMonarch,
  SingleCountryWarCasualties,
  SingleCountryWarCasualtiesRaw,
  War,
  WarInfo,
  WarRaw,
} from "../../../eu4/types/models";
import { MapPayload, QuickTipPayload } from "../../../eu4/types/map";
import { getRawData } from "../storage";
import { LedgerDataRaw, workLedgerData } from "../../../eu4/utils/ledger";
import { expandLosses } from "../../../eu4/utils/losses";
import { eu4GetMeta, loadedSave } from "./common";

let provinceIdToColorIndex = new Uint16Array();

export function eu4SetProvinceIdToColorIndex(
  _provinceIdToColorIndex: Uint16Array
) {
  provinceIdToColorIndex = _provinceIdToColorIndex;
}

export function eu4GetProvinceIdToColorIndex() {
  return provinceIdToColorIndex;
}

export function eu4MapColors(payload: MapPayload) {
  const arr = loadedSave().map_colors(provinceIdToColorIndex, payload);
  const primary = arr.subarray(0, arr.length / 2);
  const secondary = arr.subarray(arr.length / 2);
  return transfer([primary, secondary], [arr.buffer]);
}

export async function eu4Melt() {
  const data = await getRawData();
  const melt = wasmModule.melt(data);
  return transfer(melt, [melt.buffer]);
}

export function eu4GetCountries(): EnhancedCountryInfo[] {
  const countries = loadedSave().get_countries() as CountryInfo[];

  // name with accents and diacritics removed (eg: Lübeck -> Lubeck)
  // https://stackoverflow.com/a/37511463/433785
  return countries.map((x) => ({
    ...x,
    normalizedName: x.name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  }));
}

export function eu4GetCountry(tag: string) {
  return loadedSave().get_country(tag) as CountryDetails;
}

export function eu4GetCountryRulers(tag: string): RunningMonarch[] {
  const save = loadedSave();
  return save.get_country_rulers(tag) as RunningMonarch[];
}

export function eu4GetCountryGreatAdvisors(tag: string): GreatAdvisor[] {
  const save = loadedSave();
  return save.get_country_great_advisors(tag) as GreatAdvisor[];
}

export function eu4GetCountryProvinceReligion(tag: string): CountryReligion[] {
  const save = loadedSave();
  return save.get_country_province_religion(tag) as CountryReligion[];
}

export function eu4InitialMapPosition() {
  const result = loadedSave().initial_map_position();
  return result as [number, number];
}

export function eu4MapPositionOf(tag: string) {
  const result = loadedSave().map_position_of_tag(tag);
  return result as [number, number];
}

export function eu4DefaultSelectedTag(): string {
  const meta = eu4GetMeta();
  if (meta === undefined) {
    throw new Error("meta can't be undefined");
  }

  if (meta.player && meta.player !== "---") {
    return meta.player;
  }

  if (Object.keys(meta.players).length > 0) {
    return Object.keys(meta.players)[0];
  }

  if (meta.aliveCountries.length > 0) {
    return meta.aliveCountries[0];
  }

  throw new Error("unable to determine default selected country");
}

export function eu4GetPlayerHistories(): PlayerHistory[] {
  const save = loadedSave();
  return save.get_player_histories() as PlayerHistory[];
}

export function eu4MatchingCountries(matcher: CountryMatcher): LocalizedTag[] {
  const save = loadedSave();
  return save.matching_countries(matcher) as LocalizedTag[];
}

export function eu4GetNationIdeaGroups(matcher: CountryMatcher): IdeaGroup[] {
  const result = loadedSave().get_nation_idea_groups(matcher) as [
    number,
    string,
    number
  ][];

  return result.map(([groupRank, groupName, completedIdeas]) => ({
    groupRank,
    groupName,
    completedIdeas,
  }));
}

export function eu4GetAnnualIncomeData(filter: CountryMatcher): LedgerDatum[] {
  const data = loadedSave().get_annual_income_ledger(filter) as LedgerDataRaw;
  return workLedgerData(data);
}

export function eu4GetAnnualNationSizeData(
  filter: CountryMatcher
): LedgerDatum[] {
  const data = loadedSave().get_annual_nation_size_ledger(
    filter
  ) as LedgerDataRaw;
  return workLedgerData(data);
}

export function eu4GetAnnualScoreData(filter: CountryMatcher): LedgerDatum[] {
  const data = loadedSave().get_annual_score_ledger(filter) as LedgerDataRaw;
  return workLedgerData(data);
}

export function eu4GetAnnualInflationData(
  filter: CountryMatcher
): LedgerDatum[] {
  const data = loadedSave().get_annual_inflation_ledger(
    filter
  ) as LedgerDataRaw;
  return workLedgerData(data);
}

export function eu4GetHealth(filter: CountryMatcher): HealthData {
  const data = loadedSave().get_health(filter) as HealthData;
  return data;
}

export function eu4GetCountriesIncome(
  filter: CountryMatcher,
  percent: boolean,
  recurringOnly: boolean
): CountryIncome[] {
  const data = loadedSave().get_countries_income(filter) as Record<
    string,
    LocalizedCountryIncome
  >;

  return reduceToTableLedger(data, percent, recurringOnly);
}

export function eu4GetCountriesExpenses(
  filter: CountryMatcher,
  percent: boolean,
  recurringOnly: boolean
): CountryExpenses[] {
  const data = loadedSave().get_countries_expenses(filter) as Record<
    string,
    LocalizedCountryExpense
  >;

  return reduceToTableExpenseLedger(data, percent, recurringOnly);
}

export function eu4GetCountriesTotalExpenses(
  filter: CountryMatcher,
  percent: boolean,
  recurringOnly: boolean
): CountryExpenses[] {
  const data = loadedSave().get_countries_total_expenses(filter) as Record<
    string,
    LocalizedCountryExpense
  >;

  return reduceToTableExpenseLedger(data, percent, recurringOnly);
}

export function eu4GetCountriesWarLosses(
  filter: CountryMatcher
): CountryLosses[] {
  const result = loadedSave().countries_war_losses(
    filter
  ) as CountryLossesRaw[];

  return result.map(({ losses, ...rest }) => {
    return {
      ...rest,
      ...expandLosses(losses),
    };
  });
}

export function eu4GetSingleCountryCasualties(
  tag: string
): SingleCountryWarCasualties[] {
  const raw = loadedSave().get_country_casualties(
    tag
  ) as SingleCountryWarCasualtiesRaw[];
  return raw.map((x) => ({
    ...x,
    losses: expandLosses(x.losses),
  }));
}

export function eu4GetWars(filter: CountryMatcher): War[] {
  const data = loadedSave().wars(filter) as WarRaw[];
  return data.map((x) => {
    const attackerLosses = expandLosses(x.attackers.losses);
    const defenderLosses = expandLosses(x.defenders.losses);
    return {
      ...x,
      totalBattleLosses:
        attackerLosses.totalBattle + defenderLosses.totalBattle,
      totalAttritionLosses:
        attackerLosses.totalAttrition + defenderLosses.totalAttrition,
      attackers: {
        ...x.attackers,
        losses: expandLosses(x.attackers.losses),
      },
      defenders: {
        ...x.defenders,
        losses: expandLosses(x.defenders.losses),
      },
    } as War;
  });
}

export function eu4GetWarInfo(war: string): WarInfo {
  const raw = loadedSave().get_war(war) as RawWarInfo;
  return {
    ...raw,
    attacker_participants: raw.attacker_participants.map((x) => ({
      ...x,
      losses: expandLosses(x.losses),
    })),
    defender_participants: raw.defender_participants.map((x) => ({
      ...x,
      losses: expandLosses(x.losses),
    })),
  };
}

export function eu4DateToDays(s: string): number {
  return loadedSave().date_to_days(s);
}

export function eu4DaysToDate(s: number): string {
  return loadedSave().days_to_date(s);
}

export function eu4GetProvinceDeteails(id: number): ProvinceDetails {
  return loadedSave().get_province_details(id);
}

export function eu4GetMapTooltip(
  province: number,
  payload: MapPayload
): QuickTipPayload | null {
  return loadedSave().map_quick_tip(province, payload);
}

export async function eu4SaveHash(): Promise<string> {
  return wasmModule.save_checksum(await getRawData());
}

export async function eu4DownloadData(): Promise<Uint8Array> {
  const data = await getRawData();
  if (wasmModule.need_download_transformation(data)) {
    const out = wasmModule.download_transformation(data);
    return transfer(out, [out.buffer]);
  } else {
    return data;
  }
}
