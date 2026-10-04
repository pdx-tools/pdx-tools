import { readFile } from "node:fs/promises";

type CatalogRelease = {
  branch: string;
  game_version: string;
  sha256: string;
};

export type AssetRelease = CatalogRelease & {
  /** Asset version (major.minor) */
  version: string;
  /** File name in assets/game-bundles */
  bundle: string;
};

export type AssetCatalog = {
  schema_version: number;
  games: Record<"eu4" | "eu5", { releases: AssetRelease[] }>;
};

export const catalogPath = new URL("../../assets/catalog.json", import.meta.url);

/** Read assets/catalog.json. Releases are in ascending version sequence. */
export async function readAssetCatalog(): Promise<AssetCatalog> {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  if (catalog.schema_version !== 1) throw new Error("Unsupported asset catalog schema");
  for (const game of ["eu4", "eu5"] as const) {
    const releases: AssetRelease[] = catalog.games[game]?.releases ?? [];
    if (releases.length === 0) throw new Error(`The catalog has no ${game} releases`);
    releases.forEach((release, index) => {
      const [major, minor] = release.game_version.split(".").map(Number);
      const previous = releases[index - 1]?.game_version.split(".").map(Number);
      if (
        !/^\d+(\.\d+)+$/.test(release.game_version) ||
        !/^([a-f0-9]{64})?$/.test(release.sha256) ||
        !release.branch ||
        (previous && (major! < previous[0]! || (major === previous[0] && minor! <= previous[1]!)))
      ) {
        throw new Error(`Invalid, duplicate, or unsorted ${game} release: ${release.game_version}`);
      }
      release.version = `${major}.${minor}`;
      release.bundle = `${game}-${release.version}.zip`;
    });
  }
  return catalog;
}

/** Remove the derived fields before the catalog is written */
export const serializeAssetCatalog = (catalog: AssetCatalog) =>
  JSON.stringify(
    catalog,
    (key, value) => (key === "version" || key === "bundle" ? undefined : value),
    2,
  ) + "\n";
