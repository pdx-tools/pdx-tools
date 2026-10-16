/** A glob of compiled asset files, keyed by path, as import.meta.glob gives */
export type BundleGlob = Record<string, string>;

function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor === bMajor ? aMinor - bMinor : aMajor - bMajor;
}

/**
 * The compiled asset bundles of a game, keyed by version (major.minor).
 * A bundle is in the result only when each part has a file for its version.
 */
export function discoverBundles<K extends string>(
  game: string,
  parts: Record<K, BundleGlob>,
): Map<string, Record<K, string>> {
  const pattern = new RegExp(`/assets/game/${game}/(\\d+\\.\\d+)/`);
  const byPart = Object.entries<BundleGlob>(parts).map(([part, glob]) => {
    const urls = new Map<string, string>();
    for (const [path, url] of Object.entries(glob)) {
      const version = pattern.exec(path)?.[1];
      if (version !== undefined) urls.set(version, url);
    }
    return [part as K, urls] as const;
  });

  const result = new Map<string, Record<K, string>>();
  const [first] = byPart;
  for (const version of first?.[1].keys() ?? []) {
    const entries = byPart.map(([part, urls]) => [part, urls.get(version)] as const);
    if (entries.every(([, url]) => url !== undefined)) {
      result.set(version, Object.fromEntries(entries) as Record<K, string>);
    }
  }
  return result;
}

/**
 * The bundle version to use for a save's version (major.minor). When no
 * bundle has that version, the result is the closest older bundle, else the
 * oldest newer one. Set fallback to "latest" to always use the newest bundle
 * when a requested version is absent. A save without a version uses the latest.
 * Returns null when there are no bundles.
 */
export function resolveBundleVersion(
  versions: Iterable<string>,
  requested: string | null | undefined,
  fallback: "latest" | "closestOlder" = "closestOlder",
): string | null {
  const sorted = [...versions].sort(compareVersions);
  if (requested && sorted.includes(requested)) {
    return requested;
  }

  if (!requested || fallback === "latest") {
    const result = sorted.at(-1) ?? null;
    if (requested && result !== null) {
      console.warn(`No asset bundle for version ${requested}, so ${result} is used`);
    }
    return result;
  }

  const older = sorted.filter((x) => compareVersions(x, requested) < 0).at(-1);
  const result = older ?? sorted.find((x) => compareVersions(x, requested) > 0) ?? null;
  if (result !== null) {
    console.warn(`No asset bundle for version ${requested}, so ${result} is used`);
  }
  return result;
}
