import {
  CountryIncomeLedger,
  CountryExpenseLedger,
  CountryInfo,
} from "../../../../../wasm-eu4/pkg/wasm_eu4";
import { Losses } from "../utils/losses";
export type { CountryDetails } from "../worker/module";
export type {
  CountryAdvisors,
  GreatAdvisor,
  LocalizedObj,
  TagFilterPayloadRaw as CountryMatcher,
  CountryTag,
  Eu4Date,
  HealthData,
  CountryHealth,
  CountryReligion,
  CountryCulture,
  CountryIncomeLedger,
  LocalizedCountryIncome,
  CountryExpenseLedger,
  LocalizedCountryExpense,
  ProvinceDetails,
  ProvinceHistoryEvent,
  GfxObj,
  Estate,
  OwnedDevelopmentStates,
  CountryStateDetails,
  CountryManaSpend,
  DiplomacyEntry,
  RunningMonarch,
  ProvinceCountryImprovement,
  LocalizedTag,
  FailedHeir,
  TradeCompanyInvestments,
  MapDate,
  CountryLeader,
  MonarchStats,
  AchievementsScore,
  CountryState,
  TagTransition,
  ProvinceDevelopment,
} from "../../../../../wasm-eu4/pkg";
export type { Losses } from "../utils/losses";

export type SaveMode = "Normal" | "Multiplayer" | "IronmanOk" | "IronmanNo";

export interface LedgerDatum {
  tag: string;
  name: string;
  year: number;
  value: number | null;
}

export interface EnhancedCountryInfo extends CountryInfo {
  normalizedName: string;
}

export interface CountryLosses extends Losses {
  tag: string;
  name: string;
}

export interface CountryIncome extends CountryIncomeLedger {
  name: string;
  tag: string;
  total: number;
}

export interface CountryExpenses extends CountryExpenseLedger {
  name: string;
  tag: string;
  total: number;
}
