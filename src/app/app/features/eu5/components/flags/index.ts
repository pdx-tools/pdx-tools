import { spriteDimension } from "@/components/Sprite";

/** EU5 flags are rendered at a 1.5:1 aspect ratio. */
export const FLAG_CELL_WIDTH = 72;
export const FLAG_CELL_HEIGHT = 48;

const indexes = import.meta.glob<Record<string, number>>(
  "../../../../../../../assets/game/eu5/common/images/flags/flags-*.json",
  { eager: true, import: "default" },
);
const atlas72 = import.meta.glob<string>(
  "../../../../../../../assets/game/eu5/common/images/flags/flags-*_x72.webp",
  { eager: true, query: "?url", import: "default" },
);
const atlas144 = import.meta.glob<string>(
  "../../../../../../../assets/game/eu5/common/images/flags/flags-*_x144.webp",
  { eager: true, query: "?url", import: "default" },
);

export type FlagSprite = {
  index: number;
  dimensions: ReturnType<typeof spriteDimension>;
  src: string;
  srcHi: string;
};

const groupFromPath = (path: string) => path.match(/flags-([a-z0-9]+)(?:_x\d+)?\./)?.[1];

const byGroup = <T>(files: Record<string, T>): Record<string, T> =>
  Object.fromEntries(
    Object.entries(files).map(([path, value]) => {
      const group = groupFromPath(path);
      if (group === undefined) throw new Error(`Invalid EU5 flag atlas path: ${path}`);
      return [group, value];
    }),
  );

const indexByGroup = byGroup(indexes);
const atlas72ByGroup = byGroup(atlas72);
const atlas144ByGroup = byGroup(atlas144);

const dimensionsByGroup = Object.fromEntries(
  Object.entries(indexByGroup).map(([group, data]) => [
    group,
    spriteDimension({
      data,
      spriteCell: { width: FLAG_CELL_WIDTH, height: FLAG_CELL_HEIGHT },
    }),
  ]),
);

const locationByKey = new Map<string, { group: string; index: number }>();
for (const [group, data] of Object.entries(indexByGroup)) {
  for (const [key, index] of Object.entries(data)) {
    locationByKey.set(key, { group, index });
  }
}

/**
 * Look up a resolved coat of arms key's atlas tile index, if present.
 *
 * The key is already fully resolved by the wasm business logic
 * (`CountryRef.flag`), so this is a direct atlas lookup — no government/tag
 * heuristics. Unknown keys return `undefined` (the caller draws a swatch).
 */
export function flagSprite(key: string | null | undefined): FlagSprite | undefined {
  if (!key) return undefined;
  const location = locationByKey.get(key);
  if (location === undefined) return undefined;
  const { group, index } = location;
  const dimensions = dimensionsByGroup[group];
  const src = atlas72ByGroup[group];
  const srcHi = atlas144ByGroup[group];
  if (index === undefined || dimensions === undefined || src === undefined || srcHi === undefined) {
    return undefined;
  }
  return { index, dimensions, src, srcHi };
}
