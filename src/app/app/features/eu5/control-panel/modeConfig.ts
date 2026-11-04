import type { MapMode } from "@/wasm/wasm_eu5";

export type ModeVariant = {
  value: MapMode;
  /** The name of the variant on the switch beside its siblings */
  label: string;
};

/**
 * A map mode as the reader chooses it. A mode with variants shows the same
 * quantity in more than one way, and the variants are a switch on the
 * mode's key, so that only modes the game has need a place in the menu.
 */
export type ParentMode = {
  key: string;
  label: string;
  variants: [ModeVariant, ...ModeVariant[]];
};

export type ModeGroup = { label: string; modes: ParentMode[] };

const single = (value: MapMode, label: string): ParentMode => ({
  key: value,
  label,
  variants: [{ value, label }],
});

export const MODE_GROUPS: ModeGroup[] = [
  {
    label: "Realm",
    modes: [
      single("political", "Political"),
      single("control", "Control"),
      single("religion", "Religion"),
    ],
  },
  {
    label: "Economy",
    modes: [
      single("markets", "Markets"),
      {
        key: "development",
        label: "Development",
        variants: [
          { value: "development", label: "Raw" },
          { value: "stateEfficacy", label: "Effective" },
        ],
      },
      {
        key: "wealth",
        label: "Wealth",
        variants: [
          { value: "wealth", label: "Wealth" },
          { value: "unrealizedTaxBase", label: "Tax base gap" },
        ],
      },
      single("rgoLevel", "RGO Level"),
      single("buildingLevels", "Building Levels"),
    ],
  },
  {
    label: "People",
    modes: [
      {
        key: "population",
        label: "Population",
        variants: [
          { value: "population", label: "Size" },
          { value: "populationGrowth", label: "Growth" },
        ],
      },
    ],
  },
];

export const PARENT_MODES: ParentMode[] = MODE_GROUPS.flatMap((x) => x.modes);

export function parentOf(mode: MapMode): ParentMode {
  return PARENT_MODES.find((x) => x.variants.some((v) => v.value === mode)) ?? PARENT_MODES[0];
}
