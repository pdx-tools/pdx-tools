import { CountryMatcher } from "@/features/eu4/types/models";
export type { MapQuickTipPayload as QuickTipPayload } from "../../../../../wasm-eu4/pkg";

export type BorderFill = "None" | "Provinces" | "Countries";
export const mapModes = [
  "political",
  "religion",
  "development",
  "battles",
  "technology",
  "terrain",
] as const;
type MapMode = (typeof mapModes)[number];

export interface MapPayload {
  kind: MapMode;
  date: number | undefined;
  paintSubjectInOverlordHue: boolean;
  tagFilter: CountryMatcher;
}

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
