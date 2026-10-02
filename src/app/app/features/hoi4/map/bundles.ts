import { discoverBundles, resolveBundleVersion } from "@/lib/gameBundles";

const gameZipUrls = import.meta.glob<true, string, string>(
  "../../../../../../assets/game/hoi4/*/game.zip",
  { query: "?url", eager: true, import: "default" },
);

const mapZipUrls = import.meta.glob<true, string, string>(
  "../../../../../../assets/game/hoi4/*/map.zip",
  { query: "?url", eager: true, import: "default" },
);

export type Hoi4BundleUrls = { version: string; game: string; map: string };

const bundles = discoverBundles("hoi4", { game: gameZipUrls, map: mapZipUrls });

/**
 * The asset bundle for the save's version (major.minor). Refer to
 * resolveBundleVersion for the fallback rules. Returns null when no bundles
 * were compiled.
 */
export function resolveHoi4Bundle(requested: string | null | undefined): Hoi4BundleUrls | null {
  const version = resolveBundleVersion(bundles.keys(), requested);
  return version === null ? null : { version, ...bundles.get(version)! };
}
