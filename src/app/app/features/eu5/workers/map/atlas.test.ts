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
  placement: "onLand",
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

  it("cuts a wide body at its gap, and not through its land", () => {
    const line = Array.from({ length: 71 }, (_, i) => ({ x: i * 10, y: 100 }));
    const cluster = Array.from({ length: 60 }, (_, i) => ({ x: i % 20, y: 100 + (i % 3) }));
    const shape = realmShape(flat([...line, ...cluster]), WORLD);
    expect(shape?.major).toBeLessThan(750);
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

  it("keeps a name in title case smaller than any name in capitals", () => {
    const [placed] = place([name("Alençon", { ...large, minor: 10 })]);
    expect(placed.capitals).toBe(false);
    expect(placed.size).toBeLessThan(18);
  });

  it("keeps capitals for large realms, and not for short names", () => {
    const duchy = { center: { x: 200, y: 200 }, major: 70, minor: 40, angle: 0 };
    const [placed] = place([name("Bar", duchy)]);
    expect(placed.capitals).toBe(false);
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
      name(`Netherlands ${i}`, small, { placement: "nearLand" }),
    );
    const placed = place(names);
    expect(placed.length).toBeGreaterThan(1);
    expect(placed.length).toBeLessThan(30);
  });

  it("keeps a name upright and never steep", () => {
    const [placed] = place([name("Chile", { ...large, angle: 1.4 })]);
    expect(Math.abs(placed.angle)).toBeLessThanOrEqual(Math.PI / 5);
  });

  it("gives no name to a steep strip that is too narrow for it", () => {
    const strip = { center: { x: 200, y: 200 }, major: 200, minor: 10, angle: Math.PI / 2 };
    expect(place([name("Chile", strip)])).toEqual([]);
  });

  it("keeps a name in title case about as tall as its land is thick", () => {
    const strip = { center: { x: 200, y: 200 }, major: 160, minor: 4, angle: 0 };
    expect(place([name("Chile", strip)])).toEqual([]);
  });

  it("names no realm whose middle is under a panel", () => {
    const covers = [{ x: 0, y: 0, width: 400, height: 500 }];
    expect(place([name("Russia", large, { placement: "nearLand" })], covers)).toEqual([]);
  });

  it("makes a name smaller to keep it out from under a panel", () => {
    const covers = [{ x: 290, y: 0, width: 710, height: 500 }];
    const [placed] = place([name("England", large)], covers);
    expect(placed.size).toBeLessThan(30);
  });

  it("tries the smallest size before it gives way", () => {
    const narrow = { center: { x: 200, y: 200 }, major: 68, minor: 10, angle: 0 };
    const [placed] = place([name("Abcdefgh", narrow)], [{ x: 230, y: 0, width: 770, height: 500 }]);
    expect(placed.size).toBe(11);
  });

  it("keeps a name out from under a panel", () => {
    const covers = [{ x: 210, y: 0, width: 790, height: 500 }];
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

  it("reads each axis of the view with its own scale", () => {
    const [placed] = placeNames(
      [name("Russia", large)],
      { ...view, height: 400 },
      WORLD,
      frame,
      [],
      measure,
    );
    expect(placed.y).toBe(250);
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
        { placement: "nearLand" },
      ),
    );
    const placed = place([...crowd, name("Small", shape, { placement: "leaderLine" })]);
    const small = placed.find((p) => p.text === "Small")!;
    expect(small.leader?.from).toEqual({ x: 500, y: 250 });
    // The line stops below the name, so that it does not strike the letters.
    expect(small.leader!.to.y).toBeGreaterThan(small.y + 6);
  });

  it("never draws its line across a panel", () => {
    const crowd = Array.from({ length: 12 }, (_, i) =>
      name(
        "Neighbour",
        { ...shape, center: { x: 500 + ((i % 4) - 1.5) * 70, y: 250 + (i % 3) * 18 - 18 } },
        { placement: "nearLand" },
      ),
    );
    // A thin panel across the way up, where the name would go without it.
    const cover = { x: 480, y: 212, width: 40, height: 4 };
    const placed = place(
      [...crowd, name("Small", shape, { placement: "leaderLine" })],
      [cover],
    ).find((p) => p.text === "Small");
    expect(placed?.leader?.from).toEqual({ x: 500, y: 250 });
    const crossesCover = Array.from({ length: 101 }, (_, i) => i / 100).some((t) => {
      const x = 500 + (placed!.x - 500) * t;
      const y = 250 + (placed!.y - 250) * t;
      return (
        x >= cover.x && x <= cover.x + cover.width && y >= cover.y && y <= cover.y + cover.height
      );
    });
    expect(crossesCover).toBe(false);
  });

  it("keeps a later name off its line", () => {
    const crowd = Array.from({ length: 12 }, (_, i) =>
      name(
        "Neighbour",
        { ...shape, center: { x: 500 + ((i % 4) - 1.5) * 70, y: 250 + (i % 3) * 18 - 18 } },
        { placement: "nearLand" },
      ),
    );
    // The line of "Small" goes up from its land, through the middle of "X".
    const onTheLine = { center: { x: 500, y: 225 }, major: 20, minor: 20, angle: 0 };
    const placed = place([
      ...crowd,
      name("Small", shape, { placement: "leaderLine" }),
      name("X", onTheLine),
    ]);
    expect(placed.find((p) => p.text === "Small")?.leader).toBeDefined();
    expect(placed.find((p) => p.text === "X")).toBeUndefined();
  });

  it("gives no line to a name on its land", () => {
    const [placed] = place([name("Home", shape, { placement: "leaderLine" })]);
    expect(placed.leader).toBeUndefined();
  });

  it("is only for the names that have one", () => {
    const covers = [
      { x: 300, y: 150, width: 400, height: 95 },
      { x: 300, y: 255, width: 400, height: 95 },
    ];
    expect(place([name("Other", shape, { placement: "nearLand" })], covers)).toEqual([]);
  });
});
