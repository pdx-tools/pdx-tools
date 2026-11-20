import type { BySaveViz } from "./figures";

const definitions: Record<BySaveViz, string> = {
  "dev-by-save":
    "the development of the provinces that the country owns, as the Provinces table totals it.",
  "army-by-save":
    "the men in the country's land regiments, mercenaries too, in thousands; not regiments or the force limit.",
  "manpower-by-save": "the country's maximum manpower in thousands, not its current pool.",
  "world-dev-by-save": "the development of all owned provinces, as the Provinces table totals it.",
};

export function BySaveHelp({ viz }: { viz: BySaveViz }) {
  return (
    <>
      <p>Each dot is one save: {definitions[viz]}</p>
      {viz !== "world-dev-by-save" && (
        <>
          <p>
            Countries are the filter&apos;s, as chosen when you analyzed; a country without
            provinces in a save has no dot there.
          </p>
          <p>A country that changed its tag stays one row; its dots change color with the tag.</p>
        </>
      )}
      <p>
        The campaign list keeps one save for each date, and analysis keeps what it read until you
        refresh this page.
      </p>
    </>
  );
}
