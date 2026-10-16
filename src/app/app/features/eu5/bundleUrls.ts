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

type BundleVersion = { version: string; major: number; minor: number };

function parseBundleVersion(version: string): BundleVersion | null {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return { version, major: Number(match[1]), minor: Number(match[2]) };
}

function extractDirVersion(path: string): string | null {
  const match = /\/assets\/game\/eu5\/([^/]+)\//.exec(path);
  return match ? match[1] : null;
}

function discoverBundles(): Map<string, { game: string; map: string; loc: string }> {
  const games = new Map<string, string>();
  for (const [path, url] of Object.entries(gameZipUrls)) {
    const version = extractDirVersion(path);
    if (version !== null) games.set(version, url);
  }

  const locs = new Map<string, string>();
  for (const [path, url] of Object.entries(locZipUrls)) {
    const version = extractDirVersion(path);
    if (version !== null) locs.set(version, url);
  }

  const complete = new Map<string, { game: string; map: string; loc: string }>();
  for (const [path, mapUrl] of Object.entries(mapZipUrls)) {
    const version = extractDirVersion(path);
    if (version === null || parseBundleVersion(version) === null) continue;
    const gameUrl = games.get(version);
    const locUrl = locs.get(version);
    if (gameUrl && locUrl) {
      complete.set(version, { game: gameUrl, map: mapUrl, loc: locUrl });
    }
  }

  return complete;
}

const completeBundles = discoverBundles();

export function resolveBundleVersion(requested: string): string {
  if (completeBundles.has(requested)) return requested;

  const sorted = Array.from(completeBundles.keys())
    .map((v) => parseBundleVersion(v)!)
    .sort((a, b) => (b.major === a.major ? b.minor - a.minor : b.major - a.major));

  if (sorted.length === 0) {
    throw new Error("No complete EU5 optimized bundles found");
  }

  const latest = sorted[0].version;
  console.warn(`EU5 bundle for version ${requested} not found, falling back to ${latest}`);
  return latest;
}

export type BundleUrls = { game: string; map: string; loc: string };

export function getBundleUrls(resolved: string): BundleUrls {
  return completeBundles.get(resolved)!;
}
