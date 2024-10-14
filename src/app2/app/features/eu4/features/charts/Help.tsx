import { Link } from "@/components/Link";
import { VizModules } from "../../types/visualizations";
import { FinancialHelp } from "./FinancialHelp";

interface HelpProps {
  module: VizModules;
}

export const Help = ({ module }: HelpProps) => {
  switch (module) {
    case "monthly-income": {
      return (
        <>
          <p>
            The annual monthly income ledger represents the average monthly
            income a country had in a given year. Countries which lack an entire
            year's worth of data (eg: annexed or tag switched) will not have
            data for that year.
          </p>
        </>
      );
    }
    case "nation-size": {
      return (
        <>
          <p>
            The annual nation size ledger represents the number of provinces a
            country owned at the end of a given year. Countries which lack an
            entire year's worth of data (eg: annexed or tag switched) will not
            have data for that year.
          </p>
        </>
      );
    }
    case "inflation": {
      return (
        <>
          <p>
            The annual nation inflation ledger represents the nation inflation a
            country had in a given year. Countries which lack an entire year's
            worth of data (eg: annexed or tag switched) will not have data for
            that year.
          </p>
        </>
      );
    }
    case "score": {
      return (
        <>
          <p>
            The annual nation score ledger represents the nation score a country
            had in a given year. Countries which lack an entire year's worth of
            data (eg: annexed or tag switched) will not have data for that year.
          </p>
        </>
      );
    }
    case "idea-group": {
      return (
        <>
          <p>
            The Idea Groups chart shows how popular certain{" "}
            <Link href="https://eu4.paradoxwikis.com/Idea_groups">
              EU4 idea groups
            </Link>{" "}
            are among the world and players
          </p>
          <p>
            The data is first narrowed down to countries that own at least one
            province and then, optionally, further narrowed down to only players
            (ie: for multiplayer games)
          </p>
          <p>
            Selected idea groups are counted when a country has chosen to follow
            that idea group.
          </p>
          <p>
            A completed idea group is counted when a country has selected the
            group and invested into all the ideas.
          </p>
        </>
      );
    }
    case "health": {
      return (
        <>
          <p>
            The health grid depicts multiple facets of a nation in a single
            view. Since each facet has a different range of values: (eg: income
            [0, inf) treasury: (-inf, inf), corruption: [0, 100]) and different
            interpretation of the ranges: (eg: professionalism of 100 is good
            while a corruption of 100 is horrible), this visualization abstracts
            away the concrete values in favor of a color representing good
            (blue) or bad (red).
          </p>
          <p>
            Several of the facets are relative to other nations in the health
            grid. This may cause colors to be lopsided. For instance, in a
            multiplayer game, if all players are far behind in tech compared to
            an AI great nation, the health grid will show them as blue (good)
            when compared amongst themsevles but red when a nation with better
            technology is added.
          </p>
          <p>
            Similarly, if there is only one nation that is running a manpower
            deficit (even a small one) then that is a major red flag. But if a
            major war breaks out plunging many nations into a deficient, then a
            small deficient won't be colored so harshly.
          </p>
        </>
      );
    }
    case "income-table":
    case "expense-table":
    case "total-expense-table": {
      return <FinancialHelp />;
    }
    case "owned-development-states":
    case "geographical-development": {
      return <p>No help is available</p>;
    }
    case "navy-casualties":
    case "army-casualties": {
      return (
        <>
          <p>
            The army and navy casualty tables are equivalent to the in game
            "Losses" ledger page, except for a couple of improvements
          </p>
          <ul>
            <li>
              Sorting is always done numerically (so 800 won't ever be deemed
              greater than 20K)
            </li>
            <li>Countries that no longer exist are included in the table</li>
            <li>
              This is a more detailed breakdown of attrition losses than what is
              featured in game
            </li>
          </ul>
          <p>
            An interesting note about army losses is that the numbers you see
            can't be derived from losses from war battles as those don't take
            into account losses from battles with rebels (which are not stored
            in the save, unfortunately) and attrition from non-enemy
            circumstances.
          </p>
        </>
      );
    }
    case "wars": {
      return (
        <>
          <ul className="space-y-2">
            <li>
              Participants that are a part of a war since the start are denoted
              with "---"
            </li>
            <li>
              Participants that are a part of the war until the end are denoted
              with "---"
            </li>
          </ul>
          <b>Battle Help</b>
          <ul className="space-y-2">
            <li>The side that won the battle is highlighted</li>
            <li>
              Which side defended in a battle is not recorded so the attacker /
              defender terminology is in relation to war aggressors and
              defenders
            </li>
            <li>Hovering over a commander will show the commander name.</li>
            <li>
              Commander stats are written in the order of (fire / shock /
              maneuver / siege).
            </li>
            <li>
              Dead mercenary commanders are wiped from history (RIP). Their
              stats are replaced with question marks to denote a leader was
              present but their stats unknown
            </li>
            <li>
              The commander of a battle may not be the country that initiated
              the battle. For instance if an ally joins a fight at a later time
              and their commander takes over, the initial country will be listed
              with the ally's commander
            </li>
          </ul>
        </>
      );
    }
  }
};
