import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tooltip } from "@/components/Tooltip";
import { Figure } from "./Figure";

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
