import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tooltip } from "@/components/Tooltip";
import { Figure } from "./Figure";
import { StatRail } from "./StatRail";

function text(element: React.ReactElement) {
  return renderToStaticMarkup(<Tooltip.Provider>{element}</Tooltip.Provider>).replace(
    /<[^>]*>/g,
    "",
  );
}

describe("Figure", () => {
  it("keeps a whole level whole", () => {
    expect(text(<Figure value={17} form="level" />)).toBe("17");
    expect(text(<Figure value={16.52} form="level" />)).toBe("16.5");
  });
});

describe("StatRail", () => {
  const rail = (props: { rank: number; tied?: number; percentile?: number }) =>
    renderToStaticMarkup(
      <Tooltip.Provider>
        <StatRail title="Overview">
          <StatRail.Row label="Wealth" value={<Figure value={12073.9} />} {...props} />
        </StatRail>
      </Tooltip.Provider>,
    );

  it("reads a tied rank as a tie", () => {
    const markup = rail({ rank: 5, tied: 3, percentile: 0.5 });
    expect(markup).toContain("=#5");
    expect(markup).toContain("3 countries share this rank");
    expect(rail({ rank: 5, tied: 1, percentile: 0.5 })).not.toContain("=#5");
  });

  it("names a mass tie, and has no place on the track for it", () => {
    expect(rail({ rank: 1, tied: 461, percentile: 1 })).toContain("461 tied");
    expect(rail({ rank: 1, tied: 10, percentile: 1 })).not.toContain("tied");
  });

  it("takes a figure out of the page's tab order", () => {
    const markup = rail({ rank: 5 });
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-label="Wealth: 12,073.9"');
    expect(markup).not.toContain('tabindex="0"');
  });
});
