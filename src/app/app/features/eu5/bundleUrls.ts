import { discoverBundles, resolveBundleVersion as resolveVersion } from "@/lib/gameBundles";

const gameZipUrls = import.meta.glob<true, string, string>(
  "../../../../../assets/game/eu5/*/game.zip",
  { query: "?url", eager: true, import: "default" },
);

const mapZipUrls = import.meta.glob<true, string, string>(
  "../../../../../assets/game/eu5/*/map.zip",
  { query: "?url", eager: true, import: "default" },
);

const locZipUrls = import.meta.glob<true, string, string>(
  "../../../../../assets/game/eu5/*/loc-en.zip",
  { query: "?url", eager: true, import: "default" },
);

const completeBundles = discoverBundles("eu5", {
  game: gameZipUrls,
  map: mapZipUrls,
  loc: locZipUrls,
});

export function resolveBundleVersion(requested: string): string {
  const resolved = resolveVersion(completeBundles.keys(), requested, "latest");
  if (resolved === null) {
    throw new Error("No complete EU5 optimized bundles found");
  }
  return resolved;
}

export type BundleUrls = { game: string; map: string; loc: string };

export function getBundleUrls(resolved: string): BundleUrls {
  return completeBundles.get(resolved)!;
}
