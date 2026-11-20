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
            The countries, and the formed nations among them, come from the save that was open when
            you chose them, and they stay the same when you open another save. Change the filter to
            choose them again. Names and colors are those of the open save.
          </p>
          <p>
            A country that held no provinces in a save has no dot there. &quot;No record&quot; means
            the country held provinces but the save keeps no record of it. Colonial nations, client
            states, trading companies, federations and estate countries are left out and named,
            because the game gives their tags to other countries later. Custom nations stay.
          </p>
          <p>
            When that save records that one country became another, the two are listed together and
            their values are not added up. A value from before the switch under the new tag, or from
            after it under the old tag, belongs to another country with that tag: it has no dot, the
            table marks it, and it is never the first value seen.
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
