import type { BySaveViz } from "./figures";

const definitions: Record<BySaveViz, string> = {
  "dev-by-save":
    "the development of the provinces that the country owns, as the Provinces table totals it. Country details also counts a tribal country's own native development, so it can be higher.",
  "army-by-save":
    "the men in the land regiments of the country, mercenaries too, in thousands, as the Health Heatmap shows the current force strength. It is not the number of regiments or the force limit.",
  "manpower-by-save":
    "the maximum manpower of the country, in thousands, as the Health Heatmap and Country details show it. It is not the current manpower pool.",
  "world-dev-by-save": "the development of all owned provinces, as the Provinces table totals it.",
};

export function BySaveHelp({ viz }: { viz: BySaveViz }) {
  return (
    <>
      <p>
        Each dot is one save of this campaign: {definitions[viz]} Nothing is drawn between saves.
      </p>
      {viz !== "world-dev-by-save" && (
        <>
          <p>
            The countries come from the filter and stay the same when you open another save. Change
            the filter to pick them again. Names and colors are those of the open save.
          </p>
          <p>
            A country that held no provinces in a save has no dot there. Colonial nations, client
            states and other countries whose tag the game makes are left out, because the game gives
            the tag to another country later.
          </p>
          <p>
            When the open save records that one country became another, the two are listed together.
            Their values are not added up.
          </p>
        </>
      )}
      <p>
        The campaign list keeps one save for each date. Analysis reads each save once and keeps what
        it found until you refresh this page. Local saves that you add later are analyzed on their
        own.
      </p>
      <p>
        If you went back to an earlier save in the game, the dots still show what each save holds.
      </p>
    </>
  );
}
