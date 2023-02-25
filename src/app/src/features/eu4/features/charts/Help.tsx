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
            <a href="https://eu4.paradoxwikis.com/Idea_groups">
              EU4 idea groups
            </a>{" "}
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
            view. Since each facet has a different range of values: (eg:
            prestige: [-100, 100], power projection: [0, 100], treasury: (-inf,
            inf), corruption: [0, 100]) and different interpretation of the
            ranges: (eg: a prestige of 100 is good while a corruption of 100 is
            horrible), this visualization abstracts away the concrete values in
            favor of a color representing good (blue) or bad (red).
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
          <p>Below are definitions of some of the fields</p>
          <dl>
            <dt>pp</dt>
            <dd>"pp" is short for power projection</dd>

            <dt>treasury</dt>
            <dd>
              Treasury is calculated by taking the countries current balance and
              subtracting any outstanding debt. Treasury color is relative to
              other countries in the grid
            </dd>

            <dt>inflation</dt>
            <dd>
              Inflation is considered good to neutral until 15 when it starts
              turning bad (capped at 30)
            </dd>

            <dt>corruption</dt>
            <dd>
              Corruption is considered good to neutral until 10 when it starts
              turning bad (capped at 20)
            </dd>

            <dt>manpower</dt>
            <dd>
              Manpower is calculated by taking the countries current manpower
              reserves and subtracting men needed for reinforcements. Manpower
              color is relative to other countries in the grid
            </dd>

            <dt>adm / dip / mil tech</dt>
            <dd>
              Administration (adm), Diplomatic (dip), and Military (mil) tech
              are calculated relative to the other countries in the grid. A
              country's tech is considered good to neutral while it is less than
              3 techs behind the leader. More than 3 techs behind is considered
              bad (capped at 6 behind)
            </dd>
          </dl>
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
          <ul>
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
          <ul>
            <li>The side that won the battle is highlighted</li>
            <li>
              Which side defended in a battle is not recorded so the attacker /
              defender terminology is in relation to war aggressors and
              defenders
            </li>
            <li>Hovering over a commander will show the commander name.</li>
            <li>
              Commander stats are written in the order of (fire / shock /
              manuever / siege).
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
