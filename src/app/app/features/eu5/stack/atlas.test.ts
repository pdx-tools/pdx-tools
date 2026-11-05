import { describe, expect, it } from "vitest";
import { namePriority, placeNames, realmShape } from "./atlas";

const WORLD = 1000;

describe("realmShape", () => {
  it("reads a realm across the edge of the map as one realm", () => {
    const shape = realmShape(
      [
        { x: 995, y: 10 },
        { x: 5, y: 10 },
      ],
      WORLD,
    );
    expect(shape?.major).toBeLessThan(20);
  });

  it("does not let a far colony stretch the realm", () => {
    const home = Array.from({ length: 40 }, (_, i) => ({ x: 100 + i, y: 100 + (i % 5) }));
    const shape = realmShape([...home, { x: 700, y: 400 }], WORLD);
    expect(shape?.major).toBeLessThan(60);
  });

  it("stands on the main body, when a realm also holds land across a sea", () => {
    const home = Array.from({ length: 30 }, (_, i) => ({ x: 100 + (i % 6) * 4, y: 100 + i }));
    const overseas = Array.from({ length: 12 }, (_, i) => ({ x: 300 + (i % 3) * 4, y: 300 + i }));
    const shape = realmShape([...home, ...overseas], WORLD);
    expect(shape?.center.x).toBeLessThan(150);
    expect(shape?.center.y).toBeLessThan(150);
  });

  it("has no shape without points", () => {
    expect(realmShape([], WORLD)).toBeNull();
  });
});

describe("placeNames", () => {
  const view = { x: 0, y: 0, width: WORLD, height: 500 };
  const frame = { width: 1000, height: 500 };
  const free = { left: 0, right: 0, top: 0, bottom: 0 };
  const shape = { center: { x: 200, y: 200 }, major: 300, minor: 100, angle: 0 };

  it("gives the name of a large realm a large size in capitals", () => {
    const { placed } = placeNames(
      [{ key: "a", name: "Russia", shape, priority: 1 }],
      view,
      WORLD,
      frame,
      free,
    );
    expect(placed[0].capitals).toBe(true);
    expect(placed[0].size).toBeGreaterThan(20);
  });

  it("lets the higher priority win a place", () => {
    const { placed } = placeNames(
      [
        { key: "low", name: "Injuids", shape, priority: 24 },
        { key: "high", name: "England", shape, priority: 5 },
      ],
      view,
      WORLD,
      frame,
      free,
    );
    expect(placed.map((p) => p.key)).toEqual(["high"]);
  });

  it("moves a name that must show, and reports one that finds no place", () => {
    const small = { center: { x: 200, y: 200 }, major: 10, minor: 10, angle: 0 };
    const names = Array.from({ length: 30 }, (_, i) => ({
      key: `${i}`,
      name: "Netherlands",
      shape: small,
      priority: i,
      must: true,
    }));
    const { placed, missing } = placeNames(names, view, WORLD, frame, free);
    expect(placed.length).toBeGreaterThan(1);
    expect(missing.length + placed.length).toBe(30);
  });

  it("skips a small realm that does not fit its name", () => {
    const small = { center: { x: 200, y: 200 }, major: 10, minor: 10, angle: 0 };
    const { placed } = placeNames(
      [{ key: "a", name: "Netherlands", shape: small, priority: 1 }],
      view,
      WORLD,
      frame,
      free,
    );
    expect(placed).toEqual([]);
  });

  it("keeps a name upright and never steep", () => {
    const steep = { ...shape, angle: 1.4 };
    const { placed } = placeNames(
      [{ key: "a", name: "Chile", shape: steep, priority: 1 }],
      view,
      WORLD,
      frame,
      free,
    );
    expect(Math.abs(placed[0].angle)).toBeLessThanOrEqual(Math.PI / 5);
  });

  it("stays out of the part of the frame that a panel covers", () => {
    const { placed } = placeNames(
      [{ key: "a", name: "Russia", shape, priority: 1 }],
      view,
      WORLD,
      frame,
      { ...free, left: 400 },
    );
    expect(placed).toEqual([]);
  });
});

describe("namePriority", () => {
  it("puts players by rank first, then great powers, then land", () => {
    const player = (rank: number) =>
      namePriority({ isPlayer: true, greatPowerRank: rank, locationCount: 10 });
    const power = namePriority({ isPlayer: false, greatPowerRank: 2, locationCount: 500 });
    const large = namePriority({ isPlayer: false, greatPowerRank: 40, locationCount: 500 });
    const small = namePriority({ isPlayer: false, greatPowerRank: 40, locationCount: 5 });
    expect(player(4)).toBeLessThan(player(24));
    expect(player(24)).toBeLessThan(power);
    expect(power).toBeLessThan(large);
    expect(large).toBeLessThan(small);
  });
});

describe("the names that must show", () => {
  const view = { x: 0, y: 0, width: WORLD, height: 500 };
  const frame = { width: 1000, height: 500 };
  const free = { left: 0, right: 0, top: 0, bottom: 0 };
  const shape = { center: { x: 500, y: 250 }, major: 200, minor: 100, angle: 0 };

  it("orders the viewed country, the headline, a power, then land", () => {
    const base = { isPlayer: false, greatPowerRank: 0, locationCount: 5000 };
    const home = namePriority({ ...base, isHome: true });
    const leader = namePriority({ ...base, isLeader: true });
    const power = namePriority({ ...base, greatPowerRank: 3 });
    const land = namePriority(base);
    expect(home).toBeLessThan(leader);
    expect(leader).toBeLessThan(power);
    expect(power).toBeLessThan(land);
  });

  it("finds a place with a line when nearby places are full", () => {
    const crowd = Array.from({ length: 12 }, (_, i) => ({
      key: `crowd-${i}`,
      name: "Neighbour",
      shape: { ...shape, center: { x: 500 + ((i % 4) - 1.5) * 70, y: 250 + (i % 3) * 18 - 18 } },
      priority: i,
      must: true,
    }));
    const { placed, missing } = placeNames(
      [...crowd, { key: "late", name: "Small", shape, priority: 99, must: true, lead: true }],
      view,
      WORLD,
      frame,
      free,
    );
    expect(missing).not.toContain("Small");
    expect(placed.find((name) => name.key === "late")?.anchor).toEqual({ left: 500, top: 250 });
  });

  it("keeps a name out of a blocked part of the frame", () => {
    const { placed } = placeNames(
      [{ key: "a", name: "Home", shape, priority: 0, must: true, lead: true }],
      view,
      WORLD,
      frame,
      free,
      [{ x0: 400, y0: 200, x1: 600, y1: 300 }],
    );
    expect(placed[0].size).toBe(12);
    expect(placed[0].anchor).toEqual({ left: 500, top: 250 });
  });

  it("gives no line to a name on its realm", () => {
    const { placed } = placeNames(
      [{ key: "a", name: "Home", shape, priority: 0, must: true }],
      view,
      WORLD,
      frame,
      free,
    );
    expect(placed[0].anchor).toBeUndefined();
  });

  it("gives a line only to a leading name", () => {
    const { placed, missing } = placeNames(
      [{ key: "a", name: "Other", shape, priority: 0, must: true }],
      view,
      WORLD,
      frame,
      free,
      [{ x0: 300, y0: 150, x1: 700, y1: 350 }],
    );
    expect(placed).toEqual([]);
    expect(missing).toEqual(["Other"]);
  });
});
