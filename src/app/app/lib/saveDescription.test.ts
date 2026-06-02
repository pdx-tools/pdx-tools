import { describe, expect, it } from "vitest";
import { saveDescription } from "./saveDescription";

type SaveMeta = NonNullable<Parameters<typeof saveDescription>[0]>;

function meta(overrides: Partial<SaveMeta> = {}): SaveMeta {
  return {
    date: "1521.3.4",
    player_tag_name: "Norway",
    player_start_tag_name: "Norway",
    patch: "1.37.0.0",
    achievements: [],
    players: 1,
    user_name: "Nick",
    ...overrides,
  };
}

describe("saveDescription", () => {
  it("renders a single-player save with multiple achievements (plural)", () => {
    const out = saveDescription(meta({ achievements: [1, 2, 3] }));
    expect(out).toBe(
      "Norway as of 1521.3.4. EU4 1.37 campaign by Nick with 3 achievements. Explore maps, timelines, and economic data.",
    );
  });

  it("uses the singular form for a single achievement", () => {
    const out = saveDescription(meta({ achievements: [1] }));
    expect(out).toContain("with 1 achievement.");
    expect(out).not.toContain("1 achievements");
  });

  it("omits the achievements clause when there are none", () => {
    const out = saveDescription(meta({ achievements: [] }));
    expect(out).toBe(
      "Norway as of 1521.3.4. EU4 1.37 campaign by Nick. Explore maps, timelines, and economic data.",
    );
    expect(out).not.toContain("achievement");
  });

  it("notes a tag switch when start tag differs", () => {
    const out = saveDescription(
      meta({
        player_tag_name: "Prussia",
        player_start_tag_name: "Brandenburg",
        date: "1640.5.1",
      }),
    );
    expect(out).toContain("Prussia (started as Brandenburg) as of 1640.5.1.");
  });

  it("falls back to an unknown nation when the player tag name is null", () => {
    const out = saveDescription(meta({ player_tag_name: null }));
    expect(out).toContain("An unknown nation as of");
  });

  it("uses mode-first wording for multiplayer and drops nation/achievements", () => {
    const out = saveDescription(
      meta({ players: 4, player_tag_name: "Norway", achievements: [1, 2] }),
    );
    expect(out).toBe(
      "4-player EU4 1.37 multiplayer game as of 1521.3.4, uploaded by Nick. Explore maps, timelines, and economic data.",
    );
    expect(out).not.toContain("Norway");
    expect(out).not.toContain("achievement");
    expect(out).not.toContain("started as");
  });

  it("trims the four-part patch down to major.minor", () => {
    const out = saveDescription(meta({ patch: "1.37.2.1" }));
    expect(out).toContain("EU4 1.37 campaign");
    expect(out).not.toContain("1.37.2.1");
  });

  it("returns undefined for null input", () => {
    expect(saveDescription(null)).toBeUndefined();
    expect(saveDescription(undefined)).toBeUndefined();
  });

  it("stays within a reasonable meta description length", () => {
    const out = saveDescription(
      meta({
        player_tag_name: "Prussia",
        player_start_tag_name: "Brandenburg",
        achievements: [1, 2, 3, 4, 5],
      }),
    );
    expect(out!.length).toBeLessThanOrEqual(200);
  });
});
