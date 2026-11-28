import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnimatedValue, parseAnimatedValue } from "./AnimatedValue";

describe("parseAnimatedValue", () => {
  it("parses compact K, M, and B suffixes with monotonic magnitude", () => {
    const k = parseAnimatedValue("999.9K");
    const m = parseAnimatedValue("999.9M");
    const b = parseAnimatedValue("1.0B");

    expect(k?.actual).toBeCloseTo(999_900, 1);
    expect(m?.actual).toBeCloseTo(999_900_000, 1);
    expect(b?.actual).toBeCloseTo(1_000_000_000, 1);
    expect(b!.actual).toBeGreaterThan(m!.actual);
    expect(m!.actual).toBeGreaterThan(k!.actual);
  });

  it("preserves threshold prefixes like <0.1 and -<0.1% with strict ordering", () => {
    const neg = parseAnimatedValue("-0.1%");
    const negSmall = parseAnimatedValue("-<0.1%");
    const zero = parseAnimatedValue("0.0%");
    const posSmall = parseAnimatedValue("<0.1%");
    const pos = parseAnimatedValue("0.1%");

    for (const parsed of [neg, negSmall, zero, posSmall, pos]) {
      expect(parsed).not.toBeNull();
      expect(`${parsed!.prefix}${parsed!.number}${parsed!.suffix}`).toBe(parsed!.text);
    }
    expect(neg!.actual).toBeLessThan(negSmall!.actual);
    expect(negSmall!.actual).toBeLessThan(zero!.actual);
    expect(zero!.actual).toBeLessThan(posSmall!.actual);
    expect(posSmall!.actual).toBeLessThan(pos!.actual);
  });

  it("scales compact suffixes followed by trailing units like 'K mo'", () => {
    const low = parseAnimatedValue("999.9 mo", "en-US");
    const high = parseAnimatedValue("1.0K mo", "en-US");
    expect(low?.actual).toBeCloseTo(999.9, 2);
    expect(high?.actual).toBeCloseTo(1_000, 2);
    expect(high!.actual).toBeGreaterThan(low!.actual);
  });

  it("handles comma-decimal locales (es-ES, pl-PL, de-DE) and raw numbers without eating decimals", () => {
    expect(parseAnimatedValue("12,5", "es-ES")?.actual).toBeCloseTo(12.5, 5);
    expect(parseAnimatedValue("0,1%", "es-ES")?.actual).toBeCloseTo(0.1, 5);
    expect(parseAnimatedValue("12,5", "pl-PL")?.actual).toBeCloseTo(12.5, 5);
    expect(parseAnimatedValue("1.234,5", "de-DE")?.actual).toBeCloseTo(1234.5, 5);
    expect(parseAnimatedValue(12.5, "de-DE")?.actual).toBeCloseTo(12.5, 5);
  });

  it("preserves prefixes, ranks, signs, and returns null for non-numeric values", () => {
    expect(parseAnimatedValue("$1,234.5")).toMatchObject({
      prefix: "$",
      number: "1,234.5",
      suffix: "",
      actual: 1234.5,
    });
    expect(parseAnimatedValue("=#12")).toMatchObject({
      prefix: "=#",
      number: "12",
      suffix: "",
      actual: 12,
    });
    expect(parseAnimatedValue("—")).toBeNull();
    expect(parseAnimatedValue(<span>10</span>)).toBeNull();
  });
});

describe("AnimatedValue", () => {
  it("renders plain text without role=img on SSR", () => {
    const html = renderToStaticMarkup(<AnimatedValue value="14.3K" />);
    expect(html).toContain("14.3K");
    expect(html).not.toContain('role="img"');
  });
});
