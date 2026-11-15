import { describe, expect, it } from "vitest";
import type { CountryRef } from "@/wasm/wasm_eu5";
import {
  dotLabelLayout,
  labelPlace,
  linearExtent,
  logAxis,
  logDomain,
  logPosition,
  logTick,
  placeLabels,
  scatterDots,
} from "./countryScatter";
import type { CountryPoint, LabelRect, ScatterMarks } from "./countryScatter";

const country = (key: number, isPlayer = false): CountryRef => ({
  country: { key, name: `Country ${key}` },
  anchorLocationIdx: 0,
  tag: `C${key}`,
  flag: undefined,
  colorHex: "#123456",
  isPlayer,
});

const NO_MARKS: ScatterMarks = { home: null, target: null };
const asPoint = (p: CountryPoint) => p;

/** Seven countries, largest first: keys 0 to 6 with x 7 to 1 */
const seven = (players: number[] = []) =>
  Array.from({ length: 7 }, (_, i) => ({
    country: country(i, players.includes(i)),
    x: 7 - i,
    y: 1,
  }));

const dotsOf = (rows: CountryPoint[], marks = NO_MARKS) =>
  scatterDots(rows, asPoint, { x: logDomain(rows.map((r) => r.x)) }, marks);

const labeled = (dots: ReturnType<typeof dotsOf>) =>
  dots
    .filter((d) => d.labeled)
    .map((d) => d.point.country.country.key)
    .sort();

describe("logDomain", () => {
  it("starts at the power of 10 under the smallest value", () => {
    const domain = logDomain([3, 40, 25_600]);
    expect(domain.floor).toBe(1);
    expect(domain.onFloor).toBe(0);
    expect(domain.ceiling).toBeGreaterThan(25_600);
  });

  it("puts zero and negative values one decade under the smallest value", () => {
    const domain = logDomain([0, -2, 3, 40]);
    expect(domain.floor).toBe(0.1);
    expect(domain.onFloor).toBe(2);
    expect(logPosition(0, domain)).toBe(0.1);
    expect(logPosition(-2, domain)).toBe(0.1);
    expect(logPosition(3, domain)).toBe(3);
  });

  it("spans one decade or more, so that the axis has two ticks", () => {
    const domain = logDomain([20, 50]);
    expect(domain).toMatchObject({ floor: 10, ceiling: 100 });
    expect(logAxis(domain).axisLabel.showMaxLabel).toBe(true);
    expect(logAxis(logDomain([3, 40])).axisLabel.showMaxLabel).toBe(false);
  });

  it("accepts values with none above zero", () => {
    const domain = logDomain([0, 0]);
    expect(domain.onFloor).toBe(2);
    expect(domain.ceiling).toBeGreaterThan(domain.floor);
  });
});

describe("logTick", () => {
  it("names the floor by what it holds", () => {
    expect(logTick(0.1, logDomain([0, 3]))).toBe("0");
    expect(logTick(0.1, logDomain([-1, 3]))).toBe("≤0");
    expect(logTick(10_000, logDomain([0, 3]))).toBe("10K");
  });

  it("gives a real value at the floor when no value is on it", () => {
    expect(logTick(1, logDomain([3]))).toBe("1");
  });
});

describe("linearExtent", () => {
  it("goes from zero to a round value over the largest", () => {
    expect(linearExtent([1200, 4870, 3100])).toEqual({ min: 0, max: 6000 });
    expect(linearExtent([0.4, 0.95])).toEqual({ min: 0, max: 1 });
  });

  it("starts at the smallest value under zero", () => {
    expect(linearExtent([-30, 80])).toEqual({ min: -30, max: 100 });
  });

  it("accepts values with none above zero", () => {
    expect(linearExtent([0, 0])).toEqual({ min: 0, max: 1 });
    expect(linearExtent([-5])).toEqual({ min: -5, max: 0 });
  });
});

describe("scatterDots", () => {
  it("names the five largest, and draws them over the rest", () => {
    const dots = dotsOf(seven());
    expect(labeled(dots)).toEqual([0, 1, 2, 3, 4]);
    expect(dots.slice(0, 2).map((d) => d.labeled)).toEqual([false, false]);
    expect(dots.find((d) => d.point.country.country.key === 6)?.colored).toBe(false);
  });

  it("names the home country and the countries that the selection names", () => {
    const dots = dotsOf(seven(), { home: 6, target: { kind: "countries", ids: [5] } });
    expect(labeled(dots)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(dots.at(-1)?.marked).toBe(true);
  });

  it("names the players in the Players selection", () => {
    const dots = dotsOf(seven([5, 6]), { home: null, target: { kind: "players" } });
    expect(labeled(dots)).toEqual([5, 6]);
  });

  it("colors a player, and with two players or more names the largest players", () => {
    const one = dotsOf(seven([6]));
    expect(one.find((d) => d.point.country.country.key === 6)).toMatchObject({
      colored: true,
      labeled: false,
    });
    expect(labeled(dotsOf(seven([5, 6])))).toEqual([5, 6]);
  });

  it("keeps a country at zero on the floor, with its real value", () => {
    const rows = [
      { country: country(0), x: 0, y: 1 },
      { country: country(1), x: 5, y: 1 },
    ];
    const zero = dotsOf(rows).find((d) => d.point.country.country.key === 0);
    expect(zero?.value[0]).toBe(0.1);
    expect(zero?.point.x).toBe(0);
  });

  it("puts a dot at its own value on a linear axis", () => {
    const rows = [
      { country: country(0), x: 0, y: 1 },
      { country: country(1), x: 5, y: 1 },
    ];
    const zero = scatterDots(rows, asPoint, {}, NO_MARKS).find(
      (d) => d.point.country.country.key === 0,
    );
    expect(zero?.value).toEqual([0, 1]);
  });

  it("keeps the size of a dot that shows a value", () => {
    const rows = seven().map((r) => ({ ...r, symbolSize: 20 }));
    expect(new Set(dotsOf(rows).map((d) => d.symbolSize))).toEqual(new Set([20]));
  });
});

describe("labelPlace", () => {
  const plot = { x: 0, y: 0, width: 400, height: 300 };
  const dot = { x: 50, y: 50, width: 10, height: 10 };
  const overlap = (a: LabelRect, b: LabelRect) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it("goes to the right of a dot when that is free", () => {
    expect(labelPlace(dot, 30, [], plot)?.x).toBeGreaterThan(dot.x + dot.width);
  });

  it("reads back into the plot near the right end", () => {
    const late = { ...dot, x: 350 };
    const place = labelPlace(late, 30, [], plot);
    expect(place && place.x + place.width).toBeLessThanOrEqual(late.x);
  });

  it("stays in the plot", () => {
    const corner = { x: 0, y: 0, width: 10, height: 10 };
    const place = labelPlace(corner, 30, [], plot);
    expect(place && place.x >= 0 && place.y >= 0).toBe(true);
  });

  it("gives way when no place is free", () => {
    expect(labelPlace(dot, 30, [{ x: 0, y: 0, width: 200, height: 200 }], plot)).toBeNull();
  });

  it("gives each label a place that covers no other label and no dot", () => {
    const dots = [
      { rect: dot, width: 30 },
      { rect: { ...dot, x: 64 }, width: 30 },
      { rect: { ...dot, y: 66 } },
    ];
    const places = placeLabels(dots, plot);
    expect(places[2]).toBeNull();
    const [first, second] = places as LabelRect[];
    expect(overlap(first, second)).toBe(false);
    for (const { rect } of dots) {
      expect(overlap(first, rect) || overlap(second, rect)).toBe(false);
    }
  });
});

describe("dotLabelLayout", () => {
  it("gives a place to a label that a pan brings into the plot", () => {
    const rows = [
      { country: country(0), x: 10, y: 1 },
      { country: country(1), x: 1000, y: 1 },
    ];
    const dots = dotsOf(rows);
    // A zoom shows one country at a time; a pan swaps them.
    let shown = 0;
    const chart = {
      getWidth: () => 600,
      getHeight: () => 400,
      convertToPixel: (_finder: unknown, value: unknown) =>
        dots[shown]?.value === value ? [200, 200] : [-500, -500],
    } as unknown as Parameters<typeof dotLabelLayout>[1];
    const layout = dotLabelLayout(dots, chart, 0);
    const ask = () => layout({ dataIndex: shown, rect: { x: 195, y: 195, width: 10, height: 10 } });
    expect(ask()).not.toHaveProperty("fontSize");
    shown = 1;
    expect(ask()).not.toHaveProperty("fontSize");
  });
});
