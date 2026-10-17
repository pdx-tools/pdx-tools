import { describe, expect, it, vi } from "vitest";
import { discoverBundles, resolveBundleVersion } from "./gameBundles";

describe("discoverBundles", () => {
  it("keeps only versions that have all parts", () => {
    const bundles = discoverBundles("hoi4", {
      game: {
        "../assets/game/hoi4/1.14/game.zip": "g14",
        "../assets/game/hoi4/1.16/game.zip": "g16",
        "../assets/game/hoi4/latest/game.zip": "gx",
      },
      map: {
        "../assets/game/hoi4/1.16/map.zip": "m16",
      },
    });
    expect([...bundles]).toEqual([["1.16", { game: "g16", map: "m16" }]]);
  });
});

describe("resolveBundleVersion", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const versions = ["1.16", "1.10", "1.14"];

  it("uses an exact match", () => {
    expect(resolveBundleVersion(versions, "1.14")).toBe("1.14");
  });

  it("uses the closest older version", () => {
    expect(resolveBundleVersion(versions, "1.15")).toBe("1.14");
    expect(resolveBundleVersion(versions, "2.0")).toBe("1.16");
  });

  it("uses the oldest newer version when no older version exists", () => {
    expect(resolveBundleVersion(versions, "1.9")).toBe("1.10");
  });

  it("uses the latest version when the save has no version", () => {
    expect(resolveBundleVersion(versions, null)).toBe("1.16");
  });

  it("can use the latest version when a requested version is absent", () => {
    expect(resolveBundleVersion(versions, "1.15", "latest")).toBe("1.16");
  });

  it("returns null without bundles", () => {
    expect(resolveBundleVersion([], "1.14")).toBeNull();
  });
});
