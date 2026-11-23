import type { ManaUse } from "@/wasm/wasm_eu4";
import type { FigureId } from "./figures";
import { MANA_USES, useFullName } from "./mana";

const definitions: Record<FigureId, string> = {
  development:
    "the development of the provinces that the country owns, as the Provinces table totals it.",
  "autonomy-development":
    "the country's Autonomy Adjusted Development, the save's own figure, as Country Details and the Health grid show it. What it loses to autonomy is Country Details' Average Autonomy.",
  army: "the men in the country's land regiments, mercenaries too, in thousands; not regiments or the force limit.",
  "max-manpower": "the country's maximum manpower in thousands, not its current pool.",
  "mana-use":
    "the chosen country's mana spent since 1444, stacked by what it bought. The table gives each use its own figures.",
  "mana-country":
    "a country's mana spent since 1444 on the chosen use. Spend never goes down, so a line rises or stays flat.",
  "mana-banked":
    "a country's unspent mana of one type on the save's date. What the pool did between two saves is not known.",
  "world-development": "the development of all owned provinces, as the Provinces table totals it.",
  "world-autonomy-development":
    "the Autonomy Adjusted Development of every country that owns a province, each the save's own figure, as Country Details shows it.",
};

/** The game actions in each use, as the save counts them. */
const useActions: Record<ManaUse, string> = {
  tech: "buying technology",
  ideas: "buying ideas",
  stability: "raising stability",
  develop: "developing provinces",
  cores: "coring provinces",
  peace:
    "demands outside the war goal, harsh treatment, reducing war exhaustion and raising war taxes",
  leaders:
    "buying generals, admirals, conquistadors and explorers, creating leaders, force march, assaults, scorched earth, sorties, artillery barrages before 1.35, naval barrages, seizing and burning colonies, and attacking natives",
  other: "everything else, including actions the save does not name",
};

export function CampaignHelp({ figure }: { figure: FigureId }) {
  return (
    <>
      <p>Like the game&apos;s Ledger, across every save of your campaign.</p>
      <p>Each dot is one save: {definitions[figure]}</p>
      {figure.startsWith("mana-") && (
        <>
          <p>Mana is grouped by what it bought:</p>
          <ul className="list-disc pl-5">
            {MANA_USES.map((use) => (
              <li key={use}>
                {useFullName[use]}: {useActions[use]}.
              </li>
            ))}
          </ul>
          <p>
            Only counters that never go down count as spend. The save has two that can go down: an
            unnamed one, and artillery barrages from 1.35 on; both are left out. Saves keep no mana
            income and nothing about mana above 999, so no figure says what was earned or lost.
          </p>
          <p>
            &ldquo;Since&rdquo; counts from the save where watching began while you watch, and
            otherwise from the save before the selected one. In By use, the hover gives the span to
            each save from the one before, with its length; &ldquo;about N a year&rdquo; is that
            span&apos;s spend over its length.
          </p>
          <p>
            Mana is kept for the played countries, their rivals and those with 50 or more
            development in a save; another country has no dot there.
          </p>
        </>
      )}
      <p>
        Pick a figure with the menu; type its first letter to jump to it. A figure with options
        shows them beside the menu, and each keeps the option you last chose.
      </p>
      {/* By use is a stack for one country, with no lines, zoom or follow. */}
      {figure === "mana-use" ? (
        <p>
          Choose the country with the Country menu. Click the chart or use the arrows to select a
          save.
        </p>
      ) : (
        <p>
          A dashed join spans more than five years between saves, or a gap well over the
          campaign&apos;s usual one: what happened between them is not known. A short tick on a line
          marks where its country changed its tag.
        </p>
      )}
      {!figure.startsWith("world-") && figure !== "mana-use" && (
        <>
          <p>
            Countries are the filter&apos;s, as chosen when you analyzed; a country without
            provinces in a save has no dot there. The chip beside the filter says which are in
            color: all of them up to twelve, else the top five and the players. In single player,
            choose to color the followed country and its rivals instead; Mana starts that way. The
            rivals are those at the selected save, so they change as you step through the saves. A
            rival from outside the filter then has a line too, marked &ldquo;rival&rdquo; and not
            ranked, and a rival that formed another country keeps its line.
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
      {figure !== "mana-use" && (
        <p>Plus and minus zoom in time around the selected save; 0 shows every save again.</p>
      )}
      <p>
        The campaign list keeps one save for each date; &ldquo;Not shown&rdquo; lists the other
        saves of a shown date. The CSV has every figure of the chart&apos;s countries and the world.
      </p>
      <p>
        Storage: the figures of each save read are saved in this browser only, between visits, until
        you Forget the campaign. Unless the browser grants lasting storage, it may delete them if it
        runs low on space. When it is out of space, new figures aren&apos;t saved. In a private
        window they may not be saved, or last only until it closes.
      </p>
      <p>
        Watching: the chart adds a point each time the game saves. Ironman saves every 3 months of
        game time; autosaves follow your game&apos;s settings.
      </p>
      <p>
        &ldquo;Tag reused, not followed&rdquo;: the game gives colonial nations, estates, trade
        companies and other generated countries&apos; tags to other countries later, so such a
        country is not followed from save to save. &ldquo;Holders can&apos;t be told apart&rdquo;:
        more than one country held the tag in a way the saves don&apos;t separate, so whose values
        are whose is unknown.
      </p>
    </>
  );
}
