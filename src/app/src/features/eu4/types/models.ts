import { Achievement, GameDifficulty, SaveEncoding } from "@/services/appApi";

export type CountryTag = string;
export type Eu4Date = string;

export interface CountryMatcher {
  players: "all" | "alive" | "dead" | "none";
  ai: "all" | "alive" | "great" | "dead" | "none";
  subcontinents: string[];
  include: string[];
  exclude: string[];
  includeSubjects: boolean;
}

export type SaveMode = "Normal" | "Multiplayer" | "IronmanOk" | "IronmanNo";

export interface Meta {
  campaign_id: string;
  save_game: string;
  player: string;
  displayed_country_name: string;
  campaign_length: number;
  date: string;
  dlc_enabled: string[];
  multiplayer: boolean;
  savegame_version: SavegameVersion;
  mod_enabled: string[];
  mods_enabled_names: ModName[];
  is_ironman: boolean;
}

export interface ModName {
  filename: string;
  name: string;
}

export interface EnhancedMeta extends Meta {
  start_date: string;
  total_days: number;
  starting_tag: string | null;
  starting_tag_name: string | null;
  player_tag_name: string;
  dlc: number[];
  encoding: SaveEncoding;
  mode: SaveMode;
  players: Record<string, string>;
  aliveCountries: string[];
  playthroughId: string;
  gameplayOptions: GameplayOptions;
  warnings: string[];
}

export interface GameplayOptions {
  difficulty: GameDifficulty;
}

export interface GameVersion {
  first: number;
  second: number;
  third: number;
  fourth: number;
}

export interface SavegameVersion extends GameVersion {
  name: string;
}

export interface LedgerDatum {
  tag: string;
  name: string;
  year: number;
  value: number | null;
}

export interface HealthData {
  data: HealthDatum[];
}

export interface HealthDatum {
  tag: string;
  name: string;
  color: number;
  value: number;
  value_type: string;
}

export interface IronmanAchievements {
  kind: "compatible";
  score: number;
  patch: GameVersion;
  achievements: Achievement[];
}

export interface IncompatibleAchievements {
  kind: "incompatible";
  score: number;
  patch: GameVersion;
  achievements: Achievement[];
}

export type Achievements = IncompatibleAchievements | IronmanAchievements;

export interface EnhancedCountryInfo extends CountryInfo {
  normalizedName: string;
}

export interface CountryInfo {
  tag: string;
  name: string;
  color: string;
  is_human: boolean;
  is_alive: boolean;
}

export interface CountryDetails {
  tag: string;
  ruler: Ruler;
  base_tax: number;
  development: number;
  raw_development: number;
  prestige: number;
  stability: number;
  treasury: number;
  inflation: number;
  corruption: number;
  religion: string;
  primary_culture: string;
  technology: Technology;
  loans: number;
  debt: number;
  income: CountryIncomeLedger;
  expenses: CountryExpenseLedger;
  total_expenses: CountryExpenseLedger;
  mana_usage: CountryManaUsage;
  building_count: Record<string, number>;
  num_cities: number;
  ideas: [string, number][];
  inheritance: Inheritance;
  diplomacy: DiplomacyEntry[];
}

export interface Inheritance {
  start_t0_year: number;
  end_t0_year: number;
  start_t1_year: number;
  end_t1_year: number;
  start_t2_year: number;
  end_t2_year: number;
  inheritance_value: number;
  subtotal: number;
  calculations: InheritanceCalculation[];
}

export interface InheritanceCalculation {
  name: string;
  value: number;
  dependency: { Dependent: string } | "Independent";
}

export type DiplomacySubsidy = {
  kind: "Subsidy";
  amount: number;
  duration: number;
  total: number | null;
};

export type DiplomacyEntry = {
  first: LocalizedTag;
  second: LocalizedTag;
  start_date: Eu4Date | null;
} & (
  | {
      kind: "Dependency";
      subject_type: string;
    }
  | {
      kind:
        | "Alliance"
        | "RoyalMarriage"
        | "Warning"
        | "TransferTrade"
        | "SteerTrade";
    }
  | DiplomacySubsidy
  | {
      kind: "Reparations";
      end_date: Eu4Date | null;
    }
);

export interface CountryIncomeLedger {
  taxation: number;
  production: number;
  trade: number;
  gold: number;
  tariffs: number;
  vassals: number;
  harbor_fees: number;
  subsidies: number;
  war_reparations: number;
  interest: number;
  gifts: number;
  events: number;
  spoils_of_war: number;
  treasure_fleet: number;
  siphoning_income: number;
  condottieri: number;
  knowledge_sharing: number;
  blockading_foreign_ports: number;
  looting_foreign_cities: number;
  other: number;
}

export type LocalizedCountryIncome = {
  income: CountryIncomeLedger;
  name: string;
};

export interface CountryExpenseLedger {
  advisor_maintenance: number;
  interest: number;
  state_maintenance: number;
  subsidies: number;
  war_reparations: number;
  army_maintenance: number;
  fleet_maintenance: number;
  fort_maintenance: number;
  colonists: number;
  missionaries: number;
  raising_armies: number;
  building_fleets: number;
  building_fortresses: number;
  buildings: number;
  repaid_loans: number;
  gifts: number;
  advisors: number;
  events: number;
  peace: number;
  vassal_fee: number;
  tariffs: number;
  support_loyalists: number;
  condottieri: number;
  root_out_corruption: number;
  embrace_institution: number;
  knowledge_sharing: number;
  trade_company_investments: number;
  other: number;
  ports_blockaded: number;
  cities_looted: number;
  monuments: number;
  cot_upgrades: number;
  colony_changes: number;
}

export type LocalizedCountryExpense = {
  expenses: CountryExpenseLedger;
  name: string;
};

export type Ruler = MonarchStats & {
  name: string;
};

export interface Technology {
  adm_tech: number;
  dip_tech: number;
  mil_tech: number;
}

export interface CountryManaUsage {
  adm: CountryManaSpend;
  dip: CountryManaSpend;
  mil: CountryManaSpend;
}

export interface CountryManaSpend {
  buy_idea: number;
  advance_tech: number;
  boost_stab: number;
  buy_general: number;
  buy_admiral: number;
  buy_conq: number;
  buy_explorer: number;
  develop_prov: number;
  force_march: number;
  assault: number;
  seize_colony: number;
  burn_colony: number;
  attack_natives: number;
  scorch_earth: number;
  demand_non_wargoal_prov: number;
  reduce_inflation: number;
  move_capital: number;
  make_province_core: number;
  replace_rival: number;
  change_gov: number;
  change_culture: number;
  harsh_treatment: number;
  reduce_we: number;
  boost_faction: number;
  raise_war_taxes: number;
  buy_native_advancement: number;
  increse_tariffs: number;
  promote_merc: number;
  decrease_tariffs: number;
  move_trade_port: number;
  create_trade_post: number;
  siege_sorties: number;
  buy_religious_reform: number;
  set_primary_culture: number;
  add_accepted_culture: number;
  remove_accepted_culture: number;
  strengthen_government: number;
  boost_militarization: number;
  artillery_barrage: number;
  establish_siberian_frontier: number;
  government_interaction: number;
  naval_barrage: number;
  create_leader: number;
  enforce_culture: number;
  effect: number;
  minority_expulsion: number;
  other: number;
}

export interface IdeaGroup {
  groupRank: number;
  groupName: string;
  completedIdeas: number;
}

export interface Losses {
  total: number;
  totalBattle: number;
  totalAttrition: number;
  landTotalBattle: number;
  landTotalAttrition: number;
  landTotal: number;
  navyTotalBattle: number;
  navyTotalAttrition: number;
  navyTotalCapture: number;
  navyTotal: number;
  infantryBattle: number;
  infantryAttrition: number;
  cavalryBattle: number;
  cavalryAttrition: number;
  artilleryBattle: number;
  artilleryAttrition: number;
  heavyShipBattle: number;
  heavyShipAttrition: number;
  heavyShipCapture: number;
  lightShipBattle: number;
  lightShipAttrition: number;
  lightShipCapture: number;
  galleyShipBattle: number;
  galleyShipAttrition: number;
  galleyShipCapture: number;
  transportShipBattle: number;
  transportShipAttrition: number;
  transportShipCapture: number;
}

export interface CountryLossesRaw {
  tag: string;
  name: string;
  losses: number[];
}

export interface CountryLosses extends Losses {
  tag: string;
  name: string;
}

export interface WarRaw {
  name: string;
  start_date: string;
  end_date: string | null;
  days: number;
  attackers: WarSideRaw;
  defenders: WarSideRaw;
  battles: number;
}

export interface WarSideRaw {
  original: string;
  original_name: string;
  members: string[];
  losses: number[];
}

export type War = WarRaw & {
  attackers: WarSide;
  defenders: WarSide;
  totalBattleLosses: number;
  totalAttritionLosses: number;
};

export type WarSide = WarSideRaw & {
  losses: Losses;
};

export interface RawWarParticipant {
  tag: string;
  name: string;
  losses: number[];
  participation: number;
  participation_percent: number;
  joined: string | null;
  exited: string | null;
}

export interface RawWarInfo {
  battles: BattleInfo[];
  attacker_participants: RawWarParticipant[];
  defender_participants: RawWarParticipant[];
}

export interface WarParticipant {
  tag: string;
  name: string;
  losses: Losses;
  participation: number;
  participation_percent: number;
  joined: string | null;
  exited: string | null;
}

export interface WarInfo {
  battles: BattleInfo[];
  attacker_participants: WarParticipant[];
  defender_participants: WarParticipant[];
}

export interface BattleInfo {
  name: string;
  date: string;
  location: number;
  attacker_won: boolean;
  attacker: BattleSide;
  defender: BattleSide;
  winner_alliance: number;
  loser_alliance: number;
  forces: number;
  losses: number;
}

export interface BattleSide {
  cavalry: number;
  infantry: number;
  artillery: number;
  heavy_ship: number;
  light_ship: number;
  galley: number;
  transport: number;
  losses: number;
  country: string;
  country_name: string;
  commander: string | null;
  commander_stats: string | null;
}

export interface PlayerHistory {
  name: string;
  latest: string;
  is_human: boolean;
  annexed: string | null;
  player_names: string[];
  transitions: TagTransition[];
}

export interface TagTransition {
  name: string;
  tag: string;
  date: string;
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

export interface LocalizedTag {
  tag: string;
  name: string;
}

export interface ProvinceDetails {
  id: number;
  name: string;
  owner?: LocalizedTag;
  controller?: LocalizedTag;
  cores: LocalizedTag[];
  claims: LocalizedTag[];
  religion?: string;
  culture?: string;
  base_tax: number;
  base_production: number;
  base_manpower: number;
  devastation: number;
  trade_goods?: string;
  latent_trade_goods: string[];
  buildings: GfxObj[];
  is_in_trade_company: boolean;
  history: ProvinceHistoryEvent[];
  improvements: ProvinceCountryImprovement[];
  map_area?: MapAreaData;
}

export interface GfxObj {
  id: string;
  name: string;
  gfx: string;
}

export type ProvinceHistoryEvent =
  | {
      date: string;
      kind: "Owner";
      tag: string;
      name: string;
    }
  | ({
      date: string;
      kind: "Constructed" | "Demolished";
    } & GfxObj);

export interface MapAreaData {
  area_id: string;
  area_name: string;
  states: CountryState[];
  investments: TradeCompanyInvestments[];
}

export interface CountryState {
  country: LocalizedTag;
  prosperity: number;
}

export interface LocalizedObj {
  id: string;
  name: string;
}

export interface TradeCompanyInvestments {
  country: LocalizedTag;
  investments: LocalizedObj[];
}

export interface ProvinceCountryImprovement {
  country: LocalizedTag;
  improvements: number;
}

export interface RunningMonarch {
  name: string;
  country: LocalizedTag;
  start: string;
  end?: string;
  personalities: LocalizedObj[];
  failed_heirs: FailedHeir[];
  reign: number;
  adm: number;
  dip: number;
  mil: number;
  avg_adm: number;
  avg_dip: number;
  avg_mil: number;
  avg_dur_adm: number;
  avg_dur_dip: number;
  avg_dur_mil: number;
}

export interface FailedHeir {
  name: string;
  country: LocalizedTag;
  birth: string;
  personalities: LocalizedObj[];
  adm: number;
  dip: number;
  mil: number;
}

export interface GreatAdvisor {
  occupation: LocalizedObj;
  trigger_date?: string;
}

export interface CountryReligion {
  id: string;
  name: string;
  color: string;
  provinces: number;
  development: number;
  provinces_percent: number;
  development_percent: number;
}

export interface CountryCulture {
  id: string;
  name: string;
  group: string | null;
  tolerance: "Primary" | "Accepted" | "None";
  provinces: number;
  development: number;
  provinces_percent: number;
  development_percent: number;
  stated_provs: number;
  stated_provs_percent: number;
  stated_provs_development: number;
  stated_provs_development_percent: number;
  conversions: number;
  conversions_development: number;
}

export interface SingleCountryWarCasualtiesRaw {
  war: string;
  losses: number[];
  participation: number;
  participation_percent: number;
  start: string | null;
  end: string | null;
}

export interface SingleCountryWarCasualties {
  war: string;
  losses: Losses;
  participation: number;
  participation_percent: number;
  start: string | null;
  end: string | null;
}

export interface MonarchStats {
  adm: number;
  dip: number;
  mil: number;
}

export interface CountryLeader {
  id: number;
  name: string;
  fire: number;
  shock: number;
  manuever: number;
  siege: number;
  kind: "Admiral" | "General" | "Explorer" | "Conquistador";
  active: boolean;
  activation: string | null;
  monarch_stats: MonarchStats | null;
}

export interface MapDate {
  days: number;
  text: string;
}

export interface CountryStateDetails {
  state: LocalizedObj;
  total_dev: number;
  total_gc: number;
  centralizing: {
    progress: number;
    date: string;
  };
  centralized: number;
  capital_state: boolean;
  prosperity: number;
  prosperity_mode: boolean | undefined;
  state_house: boolean;
}

export type Development = {
  tax: number;
  production: number;
  manpower: number;
};

export interface GeographicalDevelopment {
  name: "root";
  world_tax: number;
  world_production: number;
  world_manpower: number;
  filtered_tax: number;
  filtered_production: number;
  filtered_manpower: number;
  uncolonized_tax: number;
  uncolonized_production: number;
  uncolonized_manpower: number;
  children: ({
    name: string; // continent
    value: number;
    children: ({
      name: string; // superregion
      value: number;
      children: ({
        name: string; // region
        value: number;
        children: ({
          name: string; // area
          value: number;
          children: ({
            name: string; // province
            value: number;
          } & Development)[];
        } & Development)[];
      } & Development)[];
    } & Development)[];
  } & Development)[];
}

export type NameValuePair = {
  name: string;
  value: number;
};

export type OwnedDevelopmentStates = {
  country: LocalizedTag;
  fullCores: Development;
  halfStates: Development;
  overextension: Development;
  tc: Development;
  territories: Development;
};
