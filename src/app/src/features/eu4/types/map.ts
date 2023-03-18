import {
  LocalizedTag,
  LocalizedObj,
  CountryMatcher,
} from "@/features/eu4/types/models";

export type BorderFill = "None" | "Provinces" | "Countries";

type MapMode =
  | "political"
  | "religion"
  | "development"
  | "technology"
  | "terrain";

export interface MapPayload {
  kind: MapMode;
  date: number | null;
  paintSubjectInOverlordHue: boolean;
  tagFilter: CountryMatcher;
}

export interface PoliticalQuickTip {
  kind: "political";
  owner: LocalizedTag;
  controller: LocalizedTag;
  provinceName: string;
  provinceId: number;
}

export interface ReligionQuickTip {
  kind: "religion";
  owner: LocalizedTag;
  controller: LocalizedTag;
  provinceName: string;
  provinceId: number;
  religionInProvince: LocalizedObj;
  stateReligion: LocalizedObj;
}

export interface DevelopmentQuickTip {
  kind: "development";
  owner: LocalizedTag;
  controller: LocalizedTag;
  provinceName: string;
  provinceId: number;
  baseTax: number;
  baseProduction: number;
  baseManpower: number;
}

export interface TechnologyQuickTip {
  kind: "technology";
  owner: LocalizedTag;
  controller: LocalizedTag;
  provinceName: string;
  provinceId: number;
  admTech: number;
  dipTech: number;
  milTech: number;
}

export type QuickTipPayload =
  | PoliticalQuickTip
  | ReligionQuickTip
  | DevelopmentQuickTip
  | TechnologyQuickTip;

// Controls that don't need to reach out to wasm
export interface MapOnlyControls {
  showProvinceBorders: boolean;
  showMapModeBorders: boolean;
  showCountryBorders: boolean;
  showTerrain: boolean;
}

export interface MapControls extends MapOnlyControls {
  mode: MapMode;
  onlyPlayers: boolean;
  borderFill: BorderFill;
  includeSubjects: boolean;
  paintSubjectInOverlordHue: boolean;
  showController: boolean;
}
