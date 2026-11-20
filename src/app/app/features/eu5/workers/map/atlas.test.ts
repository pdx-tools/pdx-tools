import { describe, expect, it } from "vitest";
import { placeNames, realmShape } from "./atlas";
import type { RealmName, RealmShape } from "./atlas";

const WORLD = 1000;
const view = { x: 0, y: 0, width: WORLD, height: 500 };
const frame = { width: 1000, height: 500 };
const measure = (text: string, capitals: boolean) => text.length * (capitals ? 0.82 : 0.56);
const large: RealmShape = { center: { x: 200, y: 200 }, major: 300, minor: 100, angle: 0 };
const small: RealmShape = { center: { x: 200, y: 200 }, major: 10, minor: 10, angle: 0 };

/** Points as the `[x, y]` pairs that a shape reads */
const flat = (points: { x: number; y: number }[]) =>
  Float64Array.from(points.flatMap((p) => [p.x, p.y]));

const name = (text: string, shape: RealmShape, extra: Partial<RealmName> = {}): RealmName => ({
  text,
  shape,
  mustShow: false,
  leaderLine: false,
  ...extra,
});

const place = (
  names: RealmName[],
  covers: { x: number; y: number; width: number; height: number }[] = [],
) => placeNames(names, view, WORLD, frame, covers, measure);

describe("realmShape", () => {
  it("reads a realm across the edge of the map as one realm", () => {
    const shape = realmShape(
      flat([
        { x: 995, y: 10 },
        { x: 5, y: 10 },
      ]),
      WORLD,
    );
    expect(shape?.major).toBeLessThan(20);
  });

  it("does not let a far colony stretch the realm", () => {
    const home = Array.from({ length: 40 }, (_, i) => ({ x: 100 + i, y: 100 + (i % 5) }));
    const shape = realmShape(flat([...home, { x: 700, y: 400 }]), WORLD);
    expect(shape?.major).toBeLessThan(60);
  });

  it("stands on the main body, when a realm also holds land across a sea", () => {
    const home = Array.from({ length: 30 }, (_, i) => ({ x: 100 + (i % 6) * 4, y: 100 + i }));
    const overseas = Array.from({ length: 12 }, (_, i) => ({ x: 300 + (i % 3) * 4, y: 300 + i }));
    const shape = realmShape(flat([...home, ...overseas]), WORLD);
    expect(shape?.center.x).toBeLessThan(150);
    expect(shape?.center.y).toBeLessThan(150);
  });

  it("has no shape without points", () => {
    expect(realmShape(new Float64Array(), WORLD)).toBeNull();
  });
});

describe("placeNames", () => {
  it("gives the name of a large realm a large size in capitals", () => {
    const [placed] = place([name("Russia", large)]);
    expect(placed.capitals).toBe(true);
    expect(placed.size).toBeGreaterThan(20);
  });

  it("lets the earlier name win a place", () => {
    const placed = place([name("England", large), name("Injuids", large)]);
    expect(placed.map((p) => p.text)).toEqual(["England"]);
  });

  it("skips a small realm that does not fit its name", () => {
    expect(place([name("Netherlands", small)])).toEqual([]);
  });

  it("moves a name that must show near its land", () => {
    const names = Array.from({ length: 30 }, (_, i) =>
      name(`Netherlands ${i}`, small, { mustShow: true }),
    );
    const placed = place(names);
    expect(placed.length).toBeGreaterThan(1);
    expect(placed.length).toBeLessThan(30);
  });

  it("keeps a name upright and never steep", () => {
    const [placed] = place([name("Chile", { ...large, angle: 1.4 })]);
    expect(Math.abs(placed.angle)).toBeLessThanOrEqual(Math.PI / 5);
  });

  it("names no realm whose middle is under a panel", () => {
    const covers = [{ x: 0, y: 0, width: 400, height: 500 }];
    expect(place([name("Russia", large, { mustShow: true })], covers)).toEqual([]);
  });

  it("keeps a name out from under a panel", () => {
    const covers = [{ x: 230, y: 0, width: 770, height: 500 }];
    expect(place([name("Russia", large)], covers)).toEqual([]);
  });

  it("reads the view across the edge of the world", () => {
    const [placed] = placeNames(
      [name("Russia", large)],
      { ...view, x: 900 },
      WORLD,
      frame,
      [],
      measure,
    );
    expect(placed.x).toBe(300);
  });
});

describe("a name with a leader line", () => {
  const shape: RealmShape = { center: { x: 500, y: 250 }, major: 200, minor: 100, angle: 0 };

  it("finds a place with a line when nearby places are full", () => {
    const crowd = Array.from({ length: 12 }, (_, i) =>
      name(
        "Neighbour",
        {
          ...shape,
          center: { x: 500 + ((i % 4) - 1.5) * 70, y: 250 + (i % 3) * 18 - 18 },
        },
        { mustShow: true },
      ),
    );
    const placed = place([...crowd, name("Small", shape, { mustShow: true, leaderLine: true })]);
    expect(placed.find((p) => p.text === "Small")?.anchor).toEqual({ x: 500, y: 250 });
  });

  it("goes around a panel, with a line to its land", () => {
    const covers = [
      { x: 400, y: 200, width: 200, height: 45 },
      { x: 400, y: 255, width: 200, height: 45 },
    ];
    const [placed] = place([name("Home", shape, { mustShow: true, leaderLine: true })], covers);
    expect(placed.size).toBe(12);
    expect(placed.anchor).toEqual({ x: 500, y: 250 });
  });

  it("gives no line to a name on its land", () => {
    const [placed] = place([name("Home", shape, { mustShow: true, leaderLine: true })]);
    expect(placed.anchor).toBeUndefined();
  });

  it("is only for the names that have one", () => {
    const covers = [
      { x: 300, y: 150, width: 400, height: 95 },
      { x: 300, y: 255, width: 400, height: 95 },
    ];
    expect(place([name("Other", shape, { mustShow: true })], covers)).toEqual([]);
  });
});
