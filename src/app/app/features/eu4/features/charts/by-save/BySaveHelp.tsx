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
      <p>
        A dotted join spans more than five years between saves, or a gap well over the
        campaign&apos;s usual one: what happened between them is not known. A short tick on a line
        marks where its country changed its tag.
      </p>
      {viz !== "world-dev-by-save" && (
        <>
          <p>
            Countries are the filter&apos;s, as chosen when you analyzed; a country without
            provinces in a save has no dot there. With more than twelve, the chip beside the filter
            says which are in color.
          </p>
          <p>
            A country that changed its tag stays one line; it changes color with the tag. A country
            annexed and later released keeps its line, as the game keeps its record.
          </p>
          <p>
            &ldquo;player&rdquo; marks a country played at some point in this campaign. A save does
            not say who played it at a given date.
          </p>
          <p>
            Click a country&apos;s line or row to follow it; with one followed, click another
            country to compare it, up to three. Escape lets go of the compared countries, then the
            followed one.
          </p>
        </>
      )}
      <p>
        Plus and minus zoom in time around the selected save; 0 shows every save again. The campaign
        list keeps one save for each date, and analysis keeps what it read until you refresh this
        page.
      </p>
    </>
  );
}
