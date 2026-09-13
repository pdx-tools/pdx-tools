import { describe, expect, it } from "vitest";
import { expandToAspect, layoutTimelapseFrame } from "@pdx.tools/timelapse";

const WORLD = { width: 16384, height: 8192 };
const OUTPUT = { width: 1920, height: 1080 };

describe("layoutTimelapseFrame", () => {
  it("fits the whole world across the frame and mattes the rest", () => {
    const layout = layoutTimelapseFrame({
      framing: "world",
      viewport: { x: 4000, y: 2000, width: 2000, height: 1000 },
      world: WORLD,
      output: OUTPUT,
    });

    expect(layout.rect).toEqual({ x: 0, y: 0, width: WORLD.width, height: WORLD.height });
    // The world is 2:1 inside a 16:9 frame: full width, and a band of matte
    // above and below the map.
    expect(layout.band).toEqual({ width: 1920, height: 960 });
    expect(layout.offset).toEqual({ x: 0, y: 60 });
  });

  it("fills the frame with the current view", () => {
    const layout = layoutTimelapseFrame({
      framing: "view",
      viewport: { x: 4000, y: 2000, width: 1600, height: 1200 },
      world: WORLD,
      output: OUTPUT,
    });

    expect(layout.band).toEqual(OUTPUT);
    expect(layout.offset).toEqual({ x: 0, y: 0 });
    // Nothing the player framed was cut: the view only grew.
    expect(layout.rect.width).toBeGreaterThanOrEqual(1600);
    expect(layout.rect.height).toBeGreaterThanOrEqual(1200);
  });

  it("keeps every band dimension even, as H.264 requires", () => {
    for (const width of [1001, 1600, 1919]) {
      const layout = layoutTimelapseFrame({
        framing: "view",
        viewport: { x: 0, y: 0, width, height: Math.round(width / 1.4) },
        world: WORLD,
        output: OUTPUT,
      });
      expect(layout.band.width % 2).toBe(0);
      expect(layout.band.height % 2).toBe(0);
    }
  });
});

describe("expandToAspect", () => {
  it("grows the short side around the center", () => {
    const rect = expandToAspect({ x: 1000, y: 1000, width: 1000, height: 1000 }, WORLD, 16 / 9);
    expect(rect.width / rect.height).toBeCloseTo(16 / 9, 2);
    expect(rect.height).toBe(1000);
    expect(rect.width).toBe(1778);
    // Centered on the same point it started on.
    expect(rect.x + rect.width / 2).toBeCloseTo(1500, 0);
  });

  it("never leaves the world vertically", () => {
    const rect = expandToAspect({ x: 0, y: 0, width: 200, height: 8192 }, WORLD, 16 / 9);
    expect(rect.y).toBe(0);
    expect(rect.height).toBeLessThanOrEqual(WORLD.height);
    expect(rect.width).toBeLessThanOrEqual(WORLD.width);
  });

  it("wraps an origin that crosses the antimeridian", () => {
    const rect = expandToAspect(
      { x: WORLD.width - 100, y: 4000, width: 200, height: 100 },
      WORLD,
      16 / 9,
    );
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x).toBeLessThan(WORLD.width);
  });
});
