import type { MapMode } from "@/wasm/wasm_eu5";

export type ModeConfig = {
  value: MapMode;
  label: string;
};

export const MAP_MODES: ModeConfig[] = [
  { value: "political", label: "Political" },
  { value: "control", label: "Control" },
  { value: "religion", label: "Religion" },
  { value: "markets", label: "Markets" },
  { value: "development", label: "Development" },
  { value: "possibleTax", label: "Possible Tax" },
  { value: "taxGap", label: "Tax Gap" },
  { value: "rgoLevel", label: "RGO Level" },
  { value: "buildingLevels", label: "Building Levels" },
  { value: "population", label: "Population" },
  { value: "stateEfficacy", label: "State Efficacy" },
];

export const GRADIENT_MODES = new Set<MapMode>([
  "control",
  "development",
  "population",
  "possibleTax",
  "taxGap",
  "rgoLevel",
  "buildingLevels",
  "stateEfficacy",
]);
